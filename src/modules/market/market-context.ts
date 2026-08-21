import type { MarketBar } from "@/modules/domain/contracts";
import { ema, momentum, sma } from "@/modules/indicators/basic";
import { atr, relativeVolume, rsi } from "@/modules/indicators/technical";
import type { MarketRegime } from "@/modules/strategy/trend-strategy";

export type IndicatorSet = { ema9: number | null; ema21: number | null; sma20: number | null; sma50: number | null; rsi14: number | null; atr14: number | null; momentum5: number | null; relativeVolume: number | null };
type RegimeInput = Pick<IndicatorSet, "ema9" | "ema21" | "atr14"> & { close: number };

export function buildIndicatorSet(bars: MarketBar[]): IndicatorSet {
  return { ema9: ema(bars, 9), ema21: ema(bars, 21), sma20: sma(bars, 20), sma50: sma(bars, 50), rsi14: rsi(bars, 14), atr14: atr(bars, 14), momentum5: momentum(bars, 5), relativeVolume: relativeVolume(bars, 20) };
}

function trend(input: RegimeInput): MarketRegime {
  if (input.ema9 === null || input.ema21 === null) return "UNKNOWN";
  if (input.atr14 !== null && input.close > 0 && input.atr14 / input.close >= 0.03) return "HIGH_VOLATILITY";
  if (input.ema9 > input.ema21) return "BULLISH";
  if (input.ema9 < input.ema21) return "BEARISH";
  return "SIDEWAYS";
}

export function classifyMarketRegime(spy: RegimeInput, qqq: RegimeInput): MarketRegime {
  const spyTrend = trend(spy);
  const qqqTrend = trend(qqq);
  if (spyTrend === "HIGH_VOLATILITY" || qqqTrend === "HIGH_VOLATILITY") return "HIGH_VOLATILITY";
  if (spyTrend === "BULLISH" && qqqTrend === "BULLISH") return "BULLISH";
  if (spyTrend === "BEARISH" && qqqTrend === "BEARISH") return "BEARISH";
  return spyTrend === "UNKNOWN" || qqqTrend === "UNKNOWN" ? "UNKNOWN" : "SIDEWAYS";
}

export function marketTrend(indicators: IndicatorSet, close: number): MarketRegime {
  return trend({ ema9: indicators.ema9, ema21: indicators.ema21, atr14: indicators.atr14, close });
}
