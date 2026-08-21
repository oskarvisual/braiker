import { stat } from "node:fs/promises";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { globalPaperBroker } from "@/modules/broker/global-paper";

const WORKER_HEARTBEAT_MAX_AGE_MS = 2 * 60 * 1000;

export type SystemStatusState = "healthy" | "warning" | "unavailable" | "disabled";
export type SystemStatusService = { id: string; label: string; state: SystemStatusState; detail: string };
export type SystemStatus = { checkedAt: Date; services: SystemStatusService[]; bots: { on: number; off: number; dead: number } };

type StatusDependencies = {
  now: () => Date;
  databaseCheck: () => Promise<void>;
  workerHeartbeat: () => Promise<Date | null>;
  marketStreamHeartbeat: () => Promise<Date | null>;
  alpacaHealth: () => Promise<{ healthy: boolean }>;
  notificationSettings: () => Promise<{ webhookEnabled: boolean; encryptedWebhookUrl: string | null; emailEnabled: boolean } | null>;
  botCounts: () => Promise<{ on: number; off: number; dead: number }>;
  config: { aiEnabled: boolean; smtpConfigured: boolean };
};

async function getWorkerHeartbeat() {
  try { return (await stat("/tmp/braiker-worker-heartbeat")).mtime; }
  catch { return null; }
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
    return { aiEnabled: runtime.AI_ENABLED, smtpConfigured: Boolean(runtime.SMTP_HOST && runtime.SMTP_FROM) };
  })();
  const dependencies: StatusDependencies = {
    now: overrides.now ?? (() => new Date()),
    databaseCheck: overrides.databaseCheck ?? (async () => { await prisma.$queryRaw`SELECT 1`; }),
    workerHeartbeat: overrides.workerHeartbeat ?? getWorkerHeartbeat,
    marketStreamHeartbeat: overrides.marketStreamHeartbeat ?? getMarketStreamHeartbeat,
    alpacaHealth: overrides.alpacaHealth ?? (() => globalPaperBroker().healthCheck()),
    notificationSettings: overrides.notificationSettings ?? (() => prisma.notificationSettings.findUnique({ where: { scope: "global" }, select: { webhookEnabled: true, encryptedWebhookUrl: true, emailEnabled: true } })),
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
  const [database, heartbeat, streamHeartbeat, alpaca, notifications, bots] = await Promise.all([
    statusOf(dependencies.databaseCheck, { id: "database", label: "MySQL database", state: "healthy", detail: "Connected and responding." }, { id: "database", label: "MySQL database", state: "unavailable", detail: "Connection check failed." }),
    dependencies.workerHeartbeat(),
    dependencies.marketStreamHeartbeat().catch(() => null),
    dependencies.alpacaHealth(),
    dependencies.notificationSettings().catch(() => null),
    dependencies.botCounts().catch(() => ({ on: 0, off: 0, dead: 0 }))
  ]);

  const smtp: SystemStatusService = dependencies.config.smtpConfigured
    ? { id: "smtp", label: "Email / SMTP", state: "warning", detail: "SMTP is configured, but alert delivery is not implemented yet." }
    : { id: "smtp", label: "Email / SMTP", state: "disabled", detail: "SMTP is not configured." };
  const webhook: SystemStatusService = notifications?.webhookEnabled && notifications.encryptedWebhookUrl
    ? { id: "webhook", label: "Webhooks", state: "warning", detail: "A destination is saved, but alert delivery is not implemented yet." }
    : notifications?.webhookEnabled
      ? { id: "webhook", label: "Webhooks", state: "warning", detail: "Webhooks are enabled but need a saved destination." }
      : { id: "webhook", label: "Webhooks", state: "disabled", detail: "Webhook alerts are disabled." };
  const openAi: SystemStatusService = dependencies.config.aiEnabled
    ? { id: "openai", label: "OpenAI / AI", state: "warning", detail: "AI advisory is enabled for candidate signals; this is configuration readiness, not a live provider check." }
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
      webhook
    ],
    bots
  };
}
