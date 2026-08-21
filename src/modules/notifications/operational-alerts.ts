import type { SystemStatus, SystemStatusService } from "@/modules/monitoring/system-status";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const statusFailureServiceIds = new Set(["database", "worker", "market-stream", "alpaca"]);

export type OperationalAlertCandidate = {
  dedupeKey: string;
  eventType: "SYSTEM_STATUS_FAILURE" | "OPENAI_QUOTA_EXHAUSTED";
  severity: "WARNING" | "CRITICAL";
  subject: string;
  message: string;
  metadata: Record<string, string>;
};

function statusAlert(service: SystemStatusService): OperationalAlertCandidate {
  return {
    dedupeKey: `status:${service.id}`,
    eventType: "SYSTEM_STATUS_FAILURE",
    severity: service.state === "unavailable" ? "CRITICAL" : "WARNING",
    subject: `${service.label} needs attention`,
    message: service.detail,
    metadata: { serviceId: service.id, status: service.state }
  };
}

/** Only required dependencies create operational alerts; optional delivery channels never alert about themselves. */
export function deriveStatusFailureAlerts(status: Pick<SystemStatus, "services">): OperationalAlertCandidate[] {
  return status.services
    .filter((service) => statusFailureServiceIds.has(service.id) && (service.state === "warning" || service.state === "unavailable"))
    .map(statusAlert);
}

export function openAiQuotaExhaustedAlert(): OperationalAlertCandidate {
  return {
    dedupeKey: "openai:quota",
    eventType: "OPENAI_QUOTA_EXHAUSTED",
    severity: "WARNING",
    subject: "OpenAI quota is exhausted",
    message: "OpenAI rejected an advisory request because quota or billing is unavailable. Deterministic safeguards continue to run.",
    metadata: { provider: "openai", reason: "quota_exhausted" }
  };
}

type NotificationAlertDb = Pick<PrismaClient, "notificationAlert" | "$executeRaw">;

async function openOrRefreshAlert(db: NotificationAlertDb, alert: OperationalAlertCandidate, now: Date) {
  // A single MySQL statement prevents competing worker checks from exposing a
  // unique-key race. Conditional assignments preserve a single incident until
  // it recovers, then clear delivery state when it later reopens.
  await db.$executeRaw`
    INSERT INTO \`NotificationAlert\` (
      \`id\`, \`dedupeKey\`, \`eventType\`, \`severity\`, \`subject\`, \`message\`, \`metadata\`, \`status\`,
      \`firstObservedAt\`, \`lastObservedAt\`, \`resolvedAt\`, \`webhookDeliveredAt\`, \`webhookLastAttemptAt\`,
      \`webhookLastError\`, \`emailDeliveredAt\`, \`emailLastAttemptAt\`, \`emailLastError\`, \`createdAt\`, \`updatedAt\`
    ) VALUES (
      ${randomUUID()}, ${alert.dedupeKey}, ${alert.eventType}, ${alert.severity}, ${alert.subject}, ${alert.message},
      CAST(${JSON.stringify(alert.metadata)} AS JSON), 'OPEN', ${now}, ${now}, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ${now}, ${now}
    ) ON DUPLICATE KEY UPDATE
      \`eventType\` = VALUES(\`eventType\`),
      \`severity\` = VALUES(\`severity\`),
      \`subject\` = VALUES(\`subject\`),
      \`message\` = VALUES(\`message\`),
      \`metadata\` = VALUES(\`metadata\`),
      \`firstObservedAt\` = IF(\`status\` = 'RESOLVED', VALUES(\`firstObservedAt\`), \`firstObservedAt\`),
      \`lastObservedAt\` = VALUES(\`lastObservedAt\`),
      \`resolvedAt\` = IF(\`status\` = 'RESOLVED', NULL, \`resolvedAt\`),
      \`webhookDeliveredAt\` = IF(\`status\` = 'RESOLVED', NULL, \`webhookDeliveredAt\`),
      \`webhookLastAttemptAt\` = IF(\`status\` = 'RESOLVED', NULL, \`webhookLastAttemptAt\`),
      \`webhookLastError\` = IF(\`status\` = 'RESOLVED', NULL, \`webhookLastError\`),
      \`emailDeliveredAt\` = IF(\`status\` = 'RESOLVED', NULL, \`emailDeliveredAt\`),
      \`emailLastAttemptAt\` = IF(\`status\` = 'RESOLVED', NULL, \`emailLastAttemptAt\`),
      \`emailLastError\` = IF(\`status\` = 'RESOLVED', NULL, \`emailLastError\`),
      \`status\` = 'OPEN',
      \`updatedAt\` = VALUES(\`updatedAt\`)
  `;
  return db.notificationAlert.findUniqueOrThrow({ where: { dedupeKey: alert.dedupeKey } });
}

/** Opens or refreshes durable outage alerts and resolves ones that recovered. */
export async function observeStatusFailureAlerts(status: Pick<SystemStatus, "services">, now = new Date(), db: NotificationAlertDb = prisma) {
  const active = deriveStatusFailureAlerts(status);
  await Promise.all(active.map((alert) => openOrRefreshAlert(db, alert, now)));
  const keys = active.map((alert) => alert.dedupeKey);
  await db.notificationAlert.updateMany({
    where: { eventType: "SYSTEM_STATUS_FAILURE", status: "OPEN", ...(keys.length ? { dedupeKey: { notIn: keys } } : {}) },
    data: { status: "RESOLVED", resolvedAt: now }
  });
  return active;
}

export async function observeOpenAiQuotaExhausted(now = new Date(), db: NotificationAlertDb = prisma) {
  return openOrRefreshAlert(db, openAiQuotaExhaustedAlert(), now);
}

export async function resolveOpenAiQuotaAlert(now = new Date(), db: NotificationAlertDb = prisma) {
  await db.notificationAlert.updateMany({ where: { dedupeKey: "openai:quota", status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: now } });
}
