import { describe, expect, it } from "vitest";
import { valueBotAssets } from "./bot-asset-valuation";

describe("bot asset valuation", () => {
  it("uses the synchronized global position price and keeps Decimal-string totals", () => {
    expect(valueBotAssets({
      positions: [{ botId: "a", symbol: "AAPL", quantity: "2", averageEntryPrice: "100" }, { botId: "b", symbol: "AAPL", quantity: "1", averageEntryPrice: "90" }],
      globalPositions: [{ symbol: "AAPL", quantity: "10", marketValue: "1250", updatedAt: "2026-08-25T10:00:00.000Z" }]
    })).toEqual({
      byBot: { a: { value: "250", valuedAt: "2026-08-25T10:00:00.000Z", unpricedSymbols: [] }, b: { value: "125", valuedAt: "2026-08-25T10:00:00.000Z", unpricedSymbols: [] } },
      allocation: [{ symbol: "AAPL", value: "375", valuedAt: "2026-08-25T10:00:00.000Z" }],
      totalValue: "375", valuedAt: "2026-08-25T10:00:00.000Z", unpricedSymbols: []
    });
  });

  it("never falls back to the average entry price when Alpaca has no current valuation", () => {
    const result = valueBotAssets({ positions: [{ botId: "a", symbol: "NVDA", quantity: "2", averageEntryPrice: "100" }], globalPositions: [] });
    expect(result.byBot.a).toEqual({ value: null, valuedAt: null, unpricedSymbols: ["NVDA"] });
    expect(result.totalValue).toBeNull();
    expect(result.allocation).toEqual([]);
  });
});
