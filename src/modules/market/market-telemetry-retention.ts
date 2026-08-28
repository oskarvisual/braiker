import type { PrismaClient } from "@prisma/client";

const BAR_RETENTION_DAYS = 14;
const STREAM_EVENT_RETENTION_DAYS = 7;
const EVALUATION_RETENTION_DAYS = 30;

export function marketTelemetryRetentionCutoffs(now = new Date()) {
  return {
    barsBefore: new Date(now.getTime() - BAR_RETENTION_DAYS * 86_400_000),
    eventsBefore: new Date(now.getTime() - STREAM_EVENT_RETENTION_DAYS * 86_400_000),
    evaluationsBefore: new Date(now.getTime() - EVALUATION_RETENTION_DAYS * 86_400_000)
  };
}

type MarketTelemetryDb = Pick<PrismaClient, "marketBar" | "marketStreamEvent" | "marketEvaluation">;

/** Removes replaceable stream diagnostics and idempotency records, never orders or decision evidence. */
export async function retainMarketTelemetry(db: MarketTelemetryDb, now = new Date()) {
  const cutoffs = marketTelemetryRetentionCutoffs(now);
  const [bars, events, evaluations] = await Promise.all([
    db.marketBar.deleteMany({ where: { timestamp: { lt: cutoffs.barsBefore } } }),
    db.marketStreamEvent.deleteMany({ where: { createdAt: { lt: cutoffs.eventsBefore } } }),
    db.marketEvaluation.deleteMany({ where: { createdAt: { lt: cutoffs.evaluationsBefore } } })
  ]);
  return { bars: bars.count, events: events.count, evaluations: evaluations.count };
}
