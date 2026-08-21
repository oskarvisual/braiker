import { describe, expect, it } from "vitest";
import type { MarketBar } from "@/modules/domain/contracts";
import { buildIndicatorSet, classifyMarketRegime } from "@/modules/market/market-context";

const bars = Array.from({ length: 60 }, (_, index): MarketBar => ({ symbol: "SPY", timeframe: "1Min", timestamp: new Date(Date.UTC(2026, 0, 2, 15, index)), open: String(100 + index), high: String(101 + index), low: String(99 + index), close: String(100 + index), volume: String(1000 + index * 5), feed: "iex" }));

describe("market context", () => {
  it("builds the requested indicator window from persisted bars", () => {
    expect(buildIndicatorSet(bars)).toMatchObject({ ema9: expect.any(Number), ema21: expect.any(Number), sma20: expect.any(Number), sma50: expect.any(Number), rsi14: 100, atr14: expect.any(Number), momentum5: expect.any(Number), relativeVolume: expect.any(Number) });
  });

  it("classifies aligned index trends as bullish and volatile bars as high volatility", () => {
    expect(classifyMarketRegime({ ema9: 110, ema21: 100, atr14: 1, close: 100 }, { ema9: 120, ema21: 100, atr14: 1, close: 100 })).toBe("BULLISH");
    expect(classifyMarketRegime({ ema9: 110, ema21: 100, atr14: 4, close: 100 }, { ema9: 120, ema21: 100, atr14: 1, close: 100 })).toBe("HIGH_VOLATILITY");
  });
});
