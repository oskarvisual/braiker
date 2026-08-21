import cron from "node-cron";
import { writeFile } from "node:fs/promises";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { bootstrapAdmin } from "@/modules/auth/bootstrap";
import { ensureTask, expireLeases, runTask } from "@/modules/scheduler/lease-scheduler";
import { workerHeartbeat } from "@/modules/monitoring/metrics";
import { processOneExecutionJob } from "@/modules/execution/execution-worker";
import { ensureGlobalPaperWallet, syncGlobalPaperAccount } from "@/modules/broker/paper-sync";
import { processMarketCycle } from "@/modules/market/market-runner";
import { isIntervalCronDue } from "@/modules/scheduler/schedule-policy";
import { ALLOWED_TRADING_SYMBOLS } from "@/modules/bots/bot-templates";
import { globalPaperCredentials } from "@/modules/broker/global-paper";
import { AlpacaMarketStreamManager } from "@/modules/market/alpaca-market-stream";
import { botScanRetentionCutoff } from "@/modules/market/bot-scan-activity";
import { runOperationalAlertCheck } from "@/modules/monitoring/operational-monitor";

async function reconcilePortfolio() {
  await syncGlobalPaperAccount();
  logger.info("Global Paper portfolio reconciliation complete");
}

async function runReconciliationIfDue() {
  const task = await prisma.scheduledTask.findUnique({ where: { name: "portfolio-reconciliation" } });
  if (!task?.enabled || !isIntervalCronDue(task.cronExpression, new Date())) return;
  await runTask("portfolio-reconciliation", reconcilePortfolio);
}

async function retainBotScanActivity() {
  const result = await prisma.botScanRun.deleteMany({ where: { startedAt: { lt: botScanRetentionCutoff() } } });
  logger.info({ deleted: result.count }, "Expired retained bot analysis activity");
}

async function main() {
  const config = env();
  if (config.TRADING_MODE !== "paper") throw new Error("Only paper trading is supported");
  await prisma.$connect();
  await bootstrapAdmin();
  await ensureGlobalPaperWallet();
  await Promise.all([
    ensureTask("lease-recovery", "*/1 * * * *"),
    ensureTask("portfolio-reconciliation", "*/5 * * * *"),
    ensureTask("market-cycle", "*/1 * * * *"),
    ensureTask("bot-scan-retention", "15 0 * * *")
  ]);
  const marketStream = new AlpacaMarketStreamManager({
    credentials: globalPaperCredentials(),
    feed: config.ALPACA_DATA_FEED,
    // The initial universe is deliberately fixed and bounded. This is one
    // shared connection, not one connection per bot or wallet.
    symbols: ALLOWED_TRADING_SYMBOLS
  });
  await marketStream.start();
  const heartbeat = async () => {
    workerHeartbeat.set(Date.now());
    await writeFile("/tmp/braiker-worker-heartbeat", String(Date.now()));
    await marketStream.recordHeartbeat().catch((error) => logger.warn({ err: error }, "Unable to record market-stream heartbeat"));
  };
  cron.schedule("*/1 * * * *", () => void runTask("lease-recovery", async () => {
    await expireLeases();
    await heartbeat();
    await runOperationalAlertCheck();
  }), { timezone: "UTC" });
  cron.schedule("*/1 * * * *", () => void runReconciliationIfDue(), { timezone: "UTC" });
  cron.schedule("15 0 * * *", () => void runTask("bot-scan-retention", retainBotScanActivity), { timezone: "UTC" });
  cron.schedule("5 * * * * *", () => void runTask("market-cycle", async () => { await processMarketCycle(); }), { timezone: "UTC" });
  cron.schedule("*/30 * * * * *", () => void processOneExecutionJob(), { timezone: "UTC" });
  await heartbeat();
  await runOperationalAlertCheck();
  logger.info({ tradingMode: config.TRADING_MODE }, "Braiker worker started in paper-only mode");
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Braiker worker stopping");
    marketStream.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => { logger.fatal({ err: error }, "Worker failed to start"); await prisma.$disconnect(); process.exit(1); });
