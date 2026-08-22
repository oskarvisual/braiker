import type { PrismaClient } from "@prisma/client";

type BriefDb = Pick<PrismaClient, "dailyMarketBrief" | "resourceSnapshot">;
type Evidence = { id: string; sourceId: string; title: string; canonicalUrl: string; contentHash: string; excerpt: string; fetchedAt: Date; source: { category: string; name: string } };

function newYorkDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Stable Date value for MySQL `DATE`, independent of the worker container timezone. */
export function newYorkMarketDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
}

/** Alpaca's next regular open accounts for exchange holidays and early sessions. */
export function isSameNewYorkCalendarDay(now: Date, nextOpen: Date) {
  return newYorkDay(now) === newYorkDay(nextOpen);
}

/** Snapshot excerpts remain evidence, not instructions. This immutable brief can only add caution. */
export function buildDailyBriefContent(snapshots: Evidence[]) {
  return {
    generatedAt: new Date().toISOString(),
    executionPolicy: "This briefing may block or defer a candidate. It must never create a signal, increase size, relax a limit, override risk, or submit an order.",
    citations: snapshots.map((snapshot) => ({ snapshotId: snapshot.id, source: snapshot.source.name, category: snapshot.source.category, title: snapshot.title, url: snapshot.canonicalUrl, hash: snapshot.contentHash, fetchedAt: snapshot.fetchedAt.toISOString(), excerpt: snapshot.excerpt.slice(0, 1_600) }))
  };
}

/** One immutable briefing per exchange day, tied to the exact resource snapshots used. */
export async function publishDailyMarketBrief(marketDate: Date, db: BriefDb) {
  const existing = await db.dailyMarketBrief.findUnique({ where: { marketDate }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const snapshots = await db.resourceSnapshot.findMany({
    where: { source: { active: true } },
    include: { source: { select: { category: true, name: true } } },
    orderBy: { fetchedAt: "desc" },
    take: 100
  }) as Evidence[];
  const newestBySource = new Map<string, Evidence>();
  for (const snapshot of snapshots) if (!newestBySource.has(snapshot.sourceId)) newestBySource.set(snapshot.sourceId, snapshot);
  const evidence = [...newestBySource.values()];
  const brief = await db.dailyMarketBrief.create({
    data: {
      marketDate,
      status: "GENERATED",
      content: buildDailyBriefContent(evidence),
      resources: { create: evidence.map((snapshot) => ({ sourceId: snapshot.sourceId, snapshotId: snapshot.id })) }
    },
    select: { id: true }
  });
  return { id: brief.id, created: true };
}
