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
  scans: { completed: number; skipped: number; errors: number; botsWithoutScan: string[] };
  briefings: Array<{ marketDate: string; botInputs: number; resources: Array<{ category: string; title: string }> }>;
  macro: { created: Array<{ title: string; startsAt: string }>; upcoming: Array<{ title: string; startsAt: string }> };
  botActivity: Array<{ name: string; status: string; reason: string }>;
};

type ReportInput = ReportCounts & { cadence: ManagerReportCadence; generatedAt: Date };

export type BotManagerReportDb = Pick<PrismaClient, "botInstance" | "order" | "botScanRun" | "dailyMarketBrief" | "macroCalendarEvent" | "notificationAlert">;

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

function compactReportText(value: string, maximum = 96) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}…` : normalized;
}

export function buildBotManagerReport(input: ReportInput) {
  const configuration = reportConfiguration[input.cadence];
  const period = reportPeriodKey(input.cadence, input.generatedAt);
  const start = periodStart(input.cadence, input.generatedAt);
  const briefingSummary = input.briefings.length
    ? input.briefings.slice(0, 2).map((briefing) => `briefing ${briefing.marketDate} distributed cautious context to ${briefing.botInputs} bots from ${briefing.resources.length} sources (${briefing.resources.slice(0, 3).map((resource) => `${compactReportText(resource.category, 24)}: ${compactReportText(resource.title)}`).join("; ") || "no reviewed sources"})`).join(" ")
    : "no daily briefing was generated in this reporting window";
  const macroCreated = input.macro.created.length ? input.macro.created.slice(0, 3).map((event) => `${compactReportText(event.title)} (${event.startsAt})`).join("; ") : "none";
  const macroUpcoming = input.macro.upcoming.length ? input.macro.upcoming.slice(0, 3).map((event) => `${compactReportText(event.title)} (${event.startsAt})`).join("; ") : "none in the next 48 hours";
  const latestActivity = input.botActivity.length ? input.botActivity.slice(0, 6).map((activity) => `${compactReportText(activity.name, 48)}: ${activity.status.toLowerCase()} (${compactReportText(activity.reason.replaceAll("_", " ").toLowerCase(), 48)})`).join("; ") : "no bot scan activity recorded";
  const message = [
    `${configuration.label} paper-only report for ${period}.`,
    `Paper-only fleet: ${input.bots.on} on, ${input.bots.off} off, ${input.bots.dead} dead.`,
    `Orders: ${input.orders.total} total, ${input.orders.filled} filled, ${input.orders.rejected} rejected, ${input.orders.inProgress} in progress.`,
    `Resources: ${briefingSummary}.`,
    `Macro added: ${macroCreated}.`,
    `Upcoming macro guard: ${macroUpcoming}.`,
    `Bot scans: ${input.scans.completed} completed, ${input.scans.skipped} skipped, ${input.scans.errors} errors.${input.scans.botsWithoutScan.length ? ` No scan: ${input.scans.botsWithoutScan.slice(0, 6).map((name) => compactReportText(name, 48)).join(", ")}.` : ""}`,
    `Bot activity: ${latestActivity}.`,
  ].join("\n");
  return {
    eventType: configuration.eventType,
    dedupeKey: `bot-manager-report:${input.cadence.toLowerCase()}:${period}`,
    subject: `${configuration.label} Bot Manager report`,
    message,
    metadata: {
      cadence: input.cadence,
      period,
      windowStart: start.toISOString(),
      windowEnd: input.generatedAt.toISOString(),
      bots: input.bots,
      orders: input.orders,
      scans: input.scans,
      briefings: input.briefings,
      macro: input.macro,
      botActivity: input.botActivity,
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

function countScans(scans: Array<{ status: string }>, botsWithoutScan: string[]) {
  return scans.reduce<ReportCounts["scans"]>((counts, scan) => {
    if (scan.status === "COMPLETED") counts.completed += 1;
    else if (scan.status === "ERROR") counts.errors += 1;
    else counts.skipped += 1;
    return counts;
  }, { completed: 0, skipped: 0, errors: 0, botsWithoutScan });
}

/** Creates one durable, idempotent Bot Manager summary for a reporting cadence. */
export async function publishBotManagerReport(cadence: ManagerReportCadence, generatedAt = new Date(), db: BotManagerReportDb = prisma) {
  const start = periodStart(cadence, generatedAt);
  const upcomingEnd = new Date(generatedAt.getTime() + 48 * 60 * 60_000);
  const [botGroups, bots, orderGroups, scans, briefs, macroCreated, macroUpcoming] = await Promise.all([
    db.botInstance.groupBy({ by: ["runMode", "lifeStatus"], _count: { _all: true } }),
    db.botInstance.findMany({ select: { id: true, name: true, lifeStatus: true } }),
    db.order.groupBy({ by: ["status"], where: { createdAt: { gte: start, lte: generatedAt } }, _count: { _all: true } }),
    db.botScanRun.findMany({ where: { startedAt: { gte: start, lte: generatedAt } }, select: { botId: true, status: true, reason: true, startedAt: true }, orderBy: { startedAt: "desc" }, take: 500 }),
    db.dailyMarketBrief.findMany({ where: { generatedAt: { gte: start, lte: generatedAt } }, select: { marketDate: true, resources: { select: { source: { select: { category: true } }, snapshot: { select: { title: true } } } }, _count: { select: { botInputs: true } } }, orderBy: { generatedAt: "desc" }, take: 7 }),
    db.macroCalendarEvent.findMany({ where: { createdAt: { gte: start, lte: generatedAt }, impact: "HIGH" }, select: { title: true, startsAt: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.macroCalendarEvent.findMany({ where: { startsAt: { gte: generatedAt, lte: upcomingEnd }, impact: "HIGH" }, select: { title: true, startsAt: true }, orderBy: { startsAt: "asc" }, take: 8 }),
  ]);
  const latestScanByBot = new Map<string, (typeof scans)[number]>();
  for (const scan of scans) if (!latestScanByBot.has(scan.botId)) latestScanByBot.set(scan.botId, scan);
  const botsWithoutScan = bots.filter((bot) => bot.lifeStatus === "ACTIVE" && !latestScanByBot.has(bot.id)).map((bot) => bot.name);
  const report = buildBotManagerReport({
    cadence,
    generatedAt,
    bots: countBots(botGroups),
    orders: countOrders(orderGroups),
    scans: countScans(scans, botsWithoutScan),
    briefings: briefs.map((brief) => ({ marketDate: brief.marketDate.toISOString().slice(0, 10), botInputs: brief._count.botInputs, resources: brief.resources.map((resource) => ({ category: resource.source.category, title: resource.snapshot.title })) })),
    macro: { created: macroCreated.map((event) => ({ title: event.title, startsAt: event.startsAt.toISOString() })), upcoming: macroUpcoming.map((event) => ({ title: event.title, startsAt: event.startsAt.toISOString() })) },
    botActivity: bots.map((bot) => ({ name: bot.name, status: latestScanByBot.get(bot.id)?.status ?? "NO_SCAN", reason: latestScanByBot.get(bot.id)?.reason ?? "NO_ACTIVITY" })).sort((left, right) => left.name.localeCompare(right.name))
  });
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
