import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { retainMarketTelemetry } from "@/modules/market/market-telemetry-retention";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;

describeMysql("market telemetry retention (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => {
    await db?.marketBar.deleteMany();
    await db?.marketStreamEvent.deleteMany();
    await db?.marketEvaluation.deleteMany();
  });
  afterAll(async () => db?.$disconnect());

  it("expires only old diagnostic data while preserving strategy-ready bars", async () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    await db!.marketBar.createMany({ data: [
      { symbol: "OLD", timeframe: "1Min", timestamp: new Date("2026-08-14T11:59:59.000Z"), open: "1", high: "1", low: "1", close: "1", volume: "1", feed: "iex" },
      { symbol: "NEW", timeframe: "1Min", timestamp: new Date("2026-08-14T12:00:00.000Z"), open: "1", high: "1", low: "1", close: "1", volume: "1", feed: "iex" }
    ] });
    await db!.marketStreamEvent.createMany({ data: [
      { eventType: "STREAM_SUCCESS", provider: "alpaca-market-data", payload: {}, createdAt: new Date("2026-08-21T11:59:59.000Z") },
      { eventType: "STREAM_SUCCESS", provider: "alpaca-market-data", payload: {}, createdAt: new Date("2026-08-21T12:00:00.000Z") }
    ] });
    await db!.marketEvaluation.createMany({ data: [
      { evaluationKey: "old-evaluation", botId: crypto.randomUUID(), symbol: "OLD", timeframe: "1Min", candleTimestamp: new Date("2026-07-29T11:59:59.000Z"), createdAt: new Date("2026-07-29T11:59:59.000Z") },
      { evaluationKey: "new-evaluation", botId: crypto.randomUUID(), symbol: "NEW", timeframe: "1Min", candleTimestamp: new Date("2026-07-29T12:00:00.000Z"), createdAt: new Date("2026-07-29T12:00:00.000Z") }
    ] });

    await expect(retainMarketTelemetry(db!, now)).resolves.toEqual({ bars: 1, events: 1, evaluations: 1 });
    await expect(db!.marketBar.findMany({ orderBy: { symbol: "asc" } })).resolves.toHaveLength(1);
    await expect(db!.marketStreamEvent.findMany()).resolves.toHaveLength(1);
    await expect(db!.marketEvaluation.findMany()).resolves.toHaveLength(1);
  });
});
