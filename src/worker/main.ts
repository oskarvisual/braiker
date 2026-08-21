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

async function reconcilePortfolio() {
  await syncGlobalPaperAccount();
  logger.info("Global Paper portfolio reconciliation complete");
}

async function runReconciliationIfDue() {
  const task = await prisma.scheduledTask.findUnique({ where: { name: "portfolio-reconciliation" } });
  if (!task?.enabled || !isIntervalCronDue(task.cronExpression, new Date())) return;
  await runTask("portfolio-reconciliation", reconcilePortfolio);
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
    ensureTask("market-cycle", "*/1 * * * *")
  ]);
  const heartbeat = async () => { workerHeartbeat.set(Date.now()); await writeFile("/tmp/braiker-worker-heartbeat", String(Date.now())); };
  cron.schedule("*/1 * * * *", () => void runTask("lease-recovery", async () => { await expireLeases(); await heartbeat(); }), { timezone: "UTC" });
  cron.schedule("*/1 * * * *", () => void runReconciliationIfDue(), { timezone: "UTC" });
  cron.schedule("5 * * * * *", () => void runTask("market-cycle", async () => { await processMarketCycle(); }), { timezone: "UTC" });
  cron.schedule("*/30 * * * * *", () => void processOneExecutionJob(), { timezone: "UTC" });
  await heartbeat();
  logger.info({ tradingMode: config.TRADING_MODE }, "Braiker worker started in paper-only mode");
}

main().catch(async (error) => { logger.fatal({ err: error }, "Worker failed to start"); await prisma.$disconnect(); process.exit(1); });
