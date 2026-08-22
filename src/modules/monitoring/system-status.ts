import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { globalPaperBroker } from "@/modules/broker/global-paper";
import { getAiRuntimeState, type AiRuntimeState } from "@/modules/ai/ai-runtime-state";
import { currentWorkerHeartbeat } from "@/modules/monitoring/worker-runtime";

const WORKER_HEARTBEAT_MAX_AGE_MS = 2 * 60 * 1000;

export type SystemStatusState = "healthy" | "configured" | "warning" | "unavailable" | "disabled";
export type SystemStatusService = { id: string; label: string; state: SystemStatusState; detail: string };
export type SystemStatus = { checkedAt: Date; services: SystemStatusService[]; bots: { on: number; off: number; dead: number }; openAi: { quotaPaused: boolean; reactivationAllowed: boolean } };

type StatusDependencies = {
  now: () => Date;
  databaseCheck: () => Promise<void>;
  workerHeartbeat: () => Promise<Date | null>;
  marketStreamHeartbeat: () => Promise<Date | null>;
  alpacaHealth: () => Promise<{ healthy: boolean }>;
  notificationSettings: () => Promise<{ webhookEnabled: boolean; encryptedWebhookUrl: string | null; emailEnabled: boolean; telegramEnabled: boolean; telegramReceiveMessages: boolean } | null>;
  telegramManagerSession: () => Promise<{ scope: string } | null>;
  openAiQuotaAlert: () => Promise<boolean>;
  openAiRuntimeState: () => Promise<AiRuntimeState>;
  botCounts: () => Promise<{ on: number; off: number; dead: number }>;
  config: { aiEnabled: boolean; smtpConfigured: boolean; telegramConfigured: boolean };
};

async function getWorkerHeartbeat() {
  return currentWorkerHeartbeat();
}

async function getMarketStreamHeartbeat() {
  const event = await prisma.marketStreamEvent.findFirst({
    where: { provider: "alpaca-market-data", eventType: "STREAM_SUCCESS" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  return event?.createdAt ?? null;
}

function workerService(heartbeat: Date | null, now: Date): SystemStatusService {
  if (!heartbeat) return { id: "worker", label: "Worker", state: "unavailable", detail: "No worker heartbeat has been recorded." };
  const age = now.getTime() - heartbeat.getTime();
  if (age > WORKER_HEARTBEAT_MAX_AGE_MS) return { id: "worker", label: "Worker", state: "warning", detail: `Heartbeat is stale (${Math.floor(age / 60_000)} minutes ago).` };
  return { id: "worker", label: "Worker", state: "healthy", detail: "Heartbeat is current; scheduler and execution loop are running." };
}

function marketStreamService(heartbeat: Date | null, now: Date): SystemStatusService {
  if (!heartbeat) return { id: "market-stream", label: "Alpaca market stream", state: "unavailable", detail: "No authenticated stream heartbeat has been recorded." };
  const age = now.getTime() - heartbeat.getTime();
  if (age > WORKER_HEARTBEAT_MAX_AGE_MS) return { id: "market-stream", label: "Alpaca market stream", state: "warning", detail: `Stream heartbeat is stale (${Math.floor(age / 60_000)} minutes ago); REST backfill remains active.` };
  return { id: "market-stream", label: "Alpaca market stream", state: "healthy", detail: "Authenticated stream is current; REST remains the reconciliation fallback." };
}

async function statusOf(check: () => Promise<void>, healthy: SystemStatusService, unavailable: SystemStatusService) {
  try { await check(); return healthy; }
  catch { return unavailable; }
}

export async function getSystemStatus(overrides: Partial<StatusDependencies> = {}): Promise<SystemStatus> {
  const config = overrides.config ?? (() => {
    const runtime = env();
    return { aiEnabled: runtime.AI_ENABLED, smtpConfigured: Boolean(runtime.SMTP_HOST && runtime.SMTP_FROM), telegramConfigured: Boolean(runtime.TELEGRAM_BOT_TOKEN) };
  })();
  const dependencies: StatusDependencies = {
    now: overrides.now ?? (() => new Date()),
    databaseCheck: overrides.databaseCheck ?? (async () => { await prisma.$queryRaw`SELECT 1`; }),
    workerHeartbeat: overrides.workerHeartbeat ?? getWorkerHeartbeat,
    marketStreamHeartbeat: overrides.marketStreamHeartbeat ?? getMarketStreamHeartbeat,
    alpacaHealth: overrides.alpacaHealth ?? (() => globalPaperBroker().healthCheck()),
    notificationSettings: overrides.notificationSettings ?? (() => prisma.notificationSettings.findUnique({ where: { scope: "global" }, select: { webhookEnabled: true, encryptedWebhookUrl: true, emailEnabled: true, telegramEnabled: true, telegramReceiveMessages: true } })),
    telegramManagerSession: overrides.telegramManagerSession ?? (() => prisma.telegramManagerSession.findUnique({ where: { scope: "global" }, select: { scope: true } })),
    openAiQuotaAlert: overrides.openAiQuotaAlert ?? (async () => (await prisma.notificationAlert.count({ where: { dedupeKey: "openai:quota", status: "OPEN" } })) > 0),
    openAiRuntimeState: overrides.openAiRuntimeState ?? (() => getAiRuntimeState()),
    botCounts: overrides.botCounts ?? (async () => {
      const [on, off, dead] = await Promise.all([
        prisma.botInstance.count({ where: { lifeStatus: "ACTIVE", runMode: "PAPER_ACTIVE", killSwitch: false } }),
        prisma.botInstance.count({ where: { lifeStatus: "ACTIVE", OR: [{ runMode: "OFF" }, { killSwitch: true }] } }),
        prisma.botInstance.count({ where: { lifeStatus: "DEAD" } })
      ]);
      return { on, off, dead };
    }),
    config
  };
  const checkedAt = dependencies.now();
  const [database, heartbeat, streamHeartbeat, alpaca, notifications, telegramSession, openAiQuotaAlert, openAiRuntimeState, bots] = await Promise.all([
    statusOf(dependencies.databaseCheck, { id: "database", label: "MySQL database", state: "healthy", detail: "Connected and responding." }, { id: "database", label: "MySQL database", state: "unavailable", detail: "Connection check failed." }),
    dependencies.workerHeartbeat(),
    dependencies.marketStreamHeartbeat().catch(() => null),
    dependencies.alpacaHealth(),
    dependencies.notificationSettings().catch(() => null),
    dependencies.telegramManagerSession().catch(() => null),
    dependencies.openAiQuotaAlert().catch(() => false),
    dependencies.openAiRuntimeState().catch(() => ({ status: "ACTIVE" as const, disabledAt: null, lastCheckedAt: null })),
    dependencies.botCounts().catch(() => ({ on: 0, off: 0, dead: 0 }))
  ]);

  const smtp: SystemStatusService = dependencies.config.smtpConfigured
    ? { id: "smtp", label: "Email / SMTP", state: "configured", detail: "SMTP is configured for selected operational alerts." }
    : { id: "smtp", label: "Email / SMTP", state: "disabled", detail: "SMTP is not configured." };
  const webhook: SystemStatusService = notifications?.webhookEnabled && notifications.encryptedWebhookUrl
    ? { id: "webhook", label: "Webhooks", state: "configured", detail: "A secure destination is configured for selected operational alerts." }
    : notifications?.webhookEnabled
      ? { id: "webhook", label: "Webhooks", state: "warning", detail: "Webhooks are enabled but need a saved destination." }
      : { id: "webhook", label: "Webhooks", state: "disabled", detail: "Webhook alerts are disabled." };
  const telegram: SystemStatusService = !dependencies.config.telegramConfigured
    ? { id: "telegram", label: "Telegram", state: "disabled", detail: "Telegram is not configured in the server environment." }
    : !telegramSession
      ? { id: "telegram", label: "Telegram", state: "warning", detail: "Telegram is configured but no Bot Manager chat is paired." }
      : notifications?.telegramEnabled || notifications?.telegramReceiveMessages
        ? { id: "telegram", label: "Telegram", state: "configured", detail: "The paired Bot Manager chat can receive selected alerts and read-only messages." }
        : { id: "telegram", label: "Telegram", state: "configured", detail: "A Bot Manager chat is paired; alerts and messages are disabled." };
  const quotaPaused = openAiRuntimeState.status === "QUOTA_EXHAUSTED" || openAiQuotaAlert;
  const openAi: SystemStatusService = quotaPaused
    ? { id: "openai", label: "OpenAI / AI", state: "warning", detail: "OpenAI advisory is paused because the provider reported quota or billing unavailable. Deterministic safeguards continue to run. An administrator can perform a minimal availability check to reactivate it." }
    : dependencies.config.aiEnabled
    ? { id: "openai", label: "OpenAI / AI", state: "configured", detail: "AI advisory is configured for candidate signals. It is contacted only when a candidate requires review." }
    : { id: "openai", label: "OpenAI / AI", state: "disabled", detail: "AI advisory is disabled and is not part of candidate reviews." };

  return {
    checkedAt,
    services: [
      { id: "web", label: "Web application", state: "healthy", detail: "This status page is being served." },
      database,
      workerService(heartbeat, checkedAt),
      marketStreamService(streamHeartbeat, checkedAt),
      alpaca.healthy
        ? { id: "alpaca", label: "Alpaca Paper API", state: "healthy", detail: "Paper account connectivity verified." }
        : { id: "alpaca", label: "Alpaca Paper API", state: "unavailable", detail: "Paper account connectivity check failed." },
      openAi,
      smtp,
      webhook,
      telegram
    ],
    bots,
    openAi: { quotaPaused, reactivationAllowed: dependencies.config.aiEnabled && quotaPaused }
  };
}
