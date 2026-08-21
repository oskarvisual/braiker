import { describe, expect, it } from "vitest";
import { evaluateTrendStrategy, type StrategyMarketContext } from "@/modules/strategy/trend-strategy";

const baseContext: StrategyMarketContext = {
  symbol: "NVDA",
  timestamp: new Date("2026-01-02T15:00:00.000Z"),
  price: "100",
  indicators: { ema9: 102, ema21: 100, sma20: 99, sma50: 97, rsi14: 60, atr14: 2, momentum5: 0.03, relativeVolume: 1.4 },
  market: { spyTrend: "BULLISH", qqqTrend: "BULLISH", regime: "BULLISH" },
  hasPosition: false,
  profile: { id: "NAVIGATOR", minimumSignalScore: 0.65, momentumWeight: 0.25, trendWeight: 0.3, volumeWeight: 0.2, marketContextWeight: 0.15, volatilityPenalty: 0.1 }
};

describe("deterministic trend strategy", () => {
  it("creates an explainable buy signal for aligned trend, momentum, volume, and market context", () => {
    const signal = evaluateTrendStrategy(baseContext);
    expect(signal).toMatchObject({ action: "BUY" });
    expect(signal.confidence).toBeGreaterThanOrEqual(65);
    expect(signal.reason).toContain("EMA9 above EMA21");
  });

  it("holds when the score does not meet the selected personality threshold", () => {
    const signal = evaluateTrendStrategy({ ...baseContext, indicators: { ...baseContext.indicators, ema9: 99, momentum5: -0.01, relativeVolume: 0.7 }, market: { spyTrend: "BEARISH", qqqTrend: "BEARISH", regime: "BEARISH" } });
    expect(signal).toMatchObject({ action: "HOLD" });
    expect(signal.reason).toContain("does not meet");
  });

  it("creates an exit signal only for an existing position", () => {
    const signal = evaluateTrendStrategy({ ...baseContext, hasPosition: true, indicators: { ...baseContext.indicators, ema9: 95, ema21: 100, momentum5: -0.03, relativeVolume: 1.1 }, market: { spyTrend: "BEARISH", qqqTrend: "BEARISH", regime: "BEARISH" } });
    expect(signal).toMatchObject({ action: "SELL" });
  });
});
