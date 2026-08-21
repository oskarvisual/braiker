import { describe, expect, it } from "vitest";
import { marketEvaluationKey, shouldAcceptBar } from "@/modules/market/market-data-policy";

describe("market data ingestion policy", () => {
  it("uses a stable per-bot candle key so stream, backfill, and retries share the same evaluation", () => {
    expect(marketEvaluationKey({ botId: "bot-1", symbol: "AAPL", timeframe: "1Min", timestamp: new Date("2026-01-02T15:31:00.000Z") })).toBe("bot-1:AAPL:1Min:2026-01-02T15:31:00.000Z");
  });

  it("rejects the in-progress candle and accepts a newly closed candle", () => {
    const now = new Date("2026-01-02T15:31:05.000Z");
    expect(shouldAcceptBar(new Date("2026-01-02T15:31:00.000Z"), now)).toBe(false);
    expect(shouldAcceptBar(new Date("2026-01-02T15:30:00.000Z"), now)).toBe(true);
  });
});
