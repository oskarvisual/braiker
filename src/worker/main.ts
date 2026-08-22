import cron from "node-cron";
import { randomUUID } from "node:crypto";
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
import { globalPaperBroker, globalPaperCredentials } from "@/modules/broker/global-paper";
import { AlpacaMarketStreamManager } from "@/modules/market/alpaca-market-stream";
import { botScanRetentionCutoff } from "@/modules/market/bot-scan-activity";
import { runOperationalAlertCheck } from "@/modules/monitoring/operational-monitor";
import { pollTelegramBotManager, sanitizeTelegramError } from "@/modules/telegram/bot-manager";
import { managerReportSchedules, publishBotManagerReport } from "@/modules/manager-reports/bot-manager-reports";
import { recordWorkerHeartbeat } from "@/modules/monitoring/worker-runtime";
import { startWorkerLivenessServer } from "@/modules/monitoring/worker-liveness";
import { ensureDefaultResourceSources } from "@/modules/resources/resource-service";
import { refreshDueResourceSources } from "@/modules/resources/resource-refresh";
import { isSameNewYorkCalendarDay, newYorkMarketDate, publishDailyMarketBrief } from "@/modules/resources/daily-market-brief";
import { publishDailyBotInputs } from "@/modules/resources/daily-bot-inputs";

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

async function activeStreamSymbols() {
  const entries = await prisma.watchlist.findMany({
    where: { enabled: true, bot: { runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", status: "RUNNING", killSwitch: false } },
    select: { symbol: true },
    distinct: ["symbol"]
  });
  return ["SPY", "QQQ", ...entries.map((entry) => entry.symbol)].filter((symbol, index, all) => all.indexOf(symbol) === index).sort();
}

async function publishBriefIfMarketDay() {
  const now = new Date();
  const clock = await globalPaperBroker().getClock();
  if (!isSameNewYorkCalendarDay(now, clock.nextOpen)) {
    logger.info({ nextOpen: clock.nextOpen }, "Skipping pre-market brief because the exchange is closed today");
    return;
  }
  const brief = await publishDailyMarketBrief(newYorkMarketDate(now), prisma);
  await publishDailyBotInputs(brief.id, prisma);
}

async function main() {
  let workerReady = false;
  const livenessPort = Number(process.env.WORKER_HEALTH_PORT ?? process.env.PORT ?? "3001");
  const liveness = startWorkerLivenessServer(livenessPort, () => workerReady);
  const config = env();
  if (config.TRADING_MODE !== "paper") throw new Error("Only paper trading is supported");
  await prisma.$connect();
  await bootstrapAdmin();
  await ensureDefaultResourceSources(prisma);
  await ensureGlobalPaperWallet();
  await Promise.all([
    ensureTask("lease-recovery", "*/1 * * * *"),
    ensureTask("portfolio-reconciliation", "*/5 * * * *"),
    ensureTask("market-cycle", "*/1 * * * *"),
    ensureTask("bot-scan-retention", "15 0 * * *"),
    ensureTask("resource-refresh", "*/15 * * * *"),
    ensureTask("daily-market-brief", "30 8 * * 1-5", "America/New_York"),
    ...managerReportSchedules.map((schedule) => ensureTask(schedule.taskName, schedule.cronExpression, schedule.timezone))
  ]);
  const marketStream = new AlpacaMarketStreamManager({
    credentials: globalPaperCredentials(),
    feed: config.ALPACA_DATA_FEED,
    // One shared connection follows active watchlists, never one socket per bot.
    symbols: await activeStreamSymbols()
  });
  await marketStream.start();
  const workerStartedAt = new Date();
  const workerInstanceId = randomUUID();
  const heartbeat = async () => {
    workerHeartbeat.set(Date.now());
    await recordWorkerHeartbeat({ instanceId: workerInstanceId, startedAt: workerStartedAt });
    marketStream.replaceSymbols(await activeStreamSymbols());
    await marketStream.recordHeartbeat().catch((error) => logger.warn({ err: error }, "Unable to record market-stream heartbeat"));
  };
  cron.schedule("*/1 * * * *", () => void runTask("lease-recovery", async () => {
    await expireLeases();
    await heartbeat();
    await runOperationalAlertCheck();
  }), { timezone: "UTC" });
  cron.schedule("*/1 * * * *", () => void runReconciliationIfDue(), { timezone: "UTC" });
  cron.schedule("15 0 * * *", () => void runTask("bot-scan-retention", retainBotScanActivity), { timezone: "UTC" });
  cron.schedule("*/15 * * * *", () => void runTask("resource-refresh", async () => { await refreshDueResourceSources(); }), { timezone: "UTC" });
  cron.schedule("30 8 * * 1-5", () => void runTask("daily-market-brief", publishBriefIfMarketDay), { timezone: "America/New_York" });
  cron.schedule("5 * * * * *", () => void runTask("market-cycle", async () => { await processMarketCycle(); }), { timezone: "UTC" });
  cron.schedule("*/30 * * * * *", () => void processOneExecutionJob(), { timezone: "UTC" });
  cron.schedule("*/10 * * * * *", () => void pollTelegramBotManager().catch((error) => logger.warn({ err: sanitizeTelegramError(error) }, "Telegram Bot Manager polling failed")), { timezone: "UTC" });
  for (const schedule of managerReportSchedules) {
    cron.schedule(schedule.cronExpression, () => void runTask(schedule.taskName, async () => {
      await publishBotManagerReport(schedule.cadence);
    }), { timezone: schedule.timezone });
  }
  await heartbeat();
  await runOperationalAlertCheck();
  workerReady = true;
  logger.info({ tradingMode: config.TRADING_MODE }, "Braiker worker started in paper-only mode");
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Braiker worker stopping");
    marketStream.stop();
    await new Promise<void>((resolve) => liveness.close(() => resolve()));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => { logger.fatal({ err: error }, "Worker failed to start"); await prisma.$disconnect(); process.exit(1); });
