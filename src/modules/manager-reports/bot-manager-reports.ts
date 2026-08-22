import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const managerReportCadences = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ManagerReportCadence = (typeof managerReportCadences)[number];

export const managerReportSchedules = [
  { cadence: "DAILY", taskName: "bot-manager-daily-report", cronExpression: "35 16 * * *", timezone: "America/New_York" },
  { cadence: "WEEKLY", taskName: "bot-manager-weekly-report", cronExpression: "45 16 * * 5", timezone: "America/New_York" },
  { cadence: "MONTHLY", taskName: "bot-manager-monthly-report", cronExpression: "0 17 1 * *", timezone: "America/New_York" },
] as const satisfies ReadonlyArray<{ cadence: ManagerReportCadence; taskName: string; cronExpression: string; timezone: string }>;

type ReportCounts = {
  bots: { on: number; off: number; dead: number };
  orders: { total: number; filled: number; rejected: number; inProgress: number };
};

type ReportInput = ReportCounts & { cadence: ManagerReportCadence; generatedAt: Date };

export type BotManagerReportDb = Pick<PrismaClient, "botInstance" | "order" | "notificationAlert">;

const reportConfiguration = {
  DAILY: { eventType: "BOT_MANAGER_DAILY_REPORT", label: "Daily" },
  WEEKLY: { eventType: "BOT_MANAGER_WEEKLY_REPORT", label: "Weekly" },
  MONTHLY: { eventType: "BOT_MANAGER_MONTHLY_REPORT", label: "Monthly" },
} as const;

function newYorkDateParts(date: Date) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => values.find((value) => value.type === type)?.value;
  return { year: part("year") ?? "0000", month: part("month") ?? "00", day: part("day") ?? "00" };
}

function reportPeriodKey(cadence: ManagerReportCadence, generatedAt: Date) {
  const { year, month, day } = newYorkDateParts(generatedAt);
  if (cadence === "MONTHLY") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function periodStart(cadence: ManagerReportCadence, generatedAt: Date) {
  const durationMs = cadence === "DAILY" ? 24 * 60 * 60_000 : cadence === "WEEKLY" ? 7 * 24 * 60 * 60_000 : 30 * 24 * 60 * 60_000;
  return new Date(generatedAt.getTime() - durationMs);
}

export function buildBotManagerReport(input: ReportInput) {
  const configuration = reportConfiguration[input.cadence];
  const period = reportPeriodKey(input.cadence, input.generatedAt);
  const start = periodStart(input.cadence, input.generatedAt);
  return {
    eventType: configuration.eventType,
    dedupeKey: `bot-manager-report:${input.cadence.toLowerCase()}:${period}`,
    subject: `${configuration.label} Bot Manager report`,
    message: `${configuration.label} paper-only report for ${period}. Paper-only: ${input.bots.on} on, ${input.bots.off} off, ${input.bots.dead} dead. Orders: ${input.orders.total} total, ${input.orders.filled} filled, ${input.orders.rejected} rejected, ${input.orders.inProgress} in progress.`,
    metadata: {
      cadence: input.cadence,
      period,
      windowStart: start.toISOString(),
      windowEnd: input.generatedAt.toISOString(),
      bots: input.bots,
      orders: input.orders,
    },
  };
}

function countBots(groups: Array<{ runMode: string; lifeStatus: string; _count: { _all: number } }>) {
  return groups.reduce<ReportCounts["bots"]>((counts, group) => {
    if (group.lifeStatus === "DEAD") counts.dead += group._count._all;
    else if (group.runMode === "PAPER_ACTIVE") counts.on += group._count._all;
    else counts.off += group._count._all;
    return counts;
  }, { on: 0, off: 0, dead: 0 });
}

function countOrders(groups: Array<{ status: string; _count: { _all: number } }>) {
  return groups.reduce<ReportCounts["orders"]>((counts, group) => {
    const amount = group._count._all;
    counts.total += amount;
    if (group.status === "FILLED") counts.filled += amount;
    else if (group.status === "REJECTED" || group.status === "FAILED") counts.rejected += amount;
    else if (group.status !== "CANCELED") counts.inProgress += amount;
    return counts;
  }, { total: 0, filled: 0, rejected: 0, inProgress: 0 });
}

/** Creates one durable, idempotent Bot Manager summary for a reporting cadence. */
export async function publishBotManagerReport(cadence: ManagerReportCadence, generatedAt = new Date(), db: BotManagerReportDb = prisma) {
  const start = periodStart(cadence, generatedAt);
  const [botGroups, orderGroups] = await Promise.all([
    db.botInstance.groupBy({ by: ["runMode", "lifeStatus"], _count: { _all: true } }),
    db.order.groupBy({ by: ["status"], where: { createdAt: { gte: start, lte: generatedAt } }, _count: { _all: true } }),
  ]);
  const report = buildBotManagerReport({ cadence, generatedAt, bots: countBots(botGroups), orders: countOrders(orderGroups) });
  return db.notificationAlert.upsert({
    where: { dedupeKey: report.dedupeKey },
    create: {
      eventType: report.eventType,
      severity: "INFO",
      subject: report.subject,
      message: report.message,
      dedupeKey: report.dedupeKey,
      firstObservedAt: generatedAt,
      lastObservedAt: generatedAt,
      metadata: report.metadata,
    },
    // Keep completed delivery timestamps untouched: repeated scheduler delivery is idempotent.
    update: { subject: report.subject, message: report.message, lastObservedAt: generatedAt, metadata: report.metadata },
  });
}
