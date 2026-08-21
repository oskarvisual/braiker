import type { StrategySignal } from "@/modules/domain/contracts";

export type MarketRegime = "BULLISH" | "BEARISH" | "SIDEWAYS" | "HIGH_VOLATILITY" | "UNKNOWN";
export type StrategyProfile = { id: "GUARDIAN" | "NAVIGATOR" | "EXPLORER"; minimumSignalScore: number; momentumWeight: number; trendWeight: number; volumeWeight: number; marketContextWeight: number; volatilityPenalty: number };
export type StrategyMarketContext = {
  symbol: string;
  timestamp: Date;
  price: string;
  indicators: { ema9: number | null; ema21: number | null; sma20: number | null; sma50: number | null; rsi14: number | null; atr14: number | null; momentum5: number | null; relativeVolume: number | null };
  market: { spyTrend: MarketRegime; qqqTrend: MarketRegime; regime: MarketRegime };
  hasPosition: boolean;
  profile: StrategyProfile;
};

function scoreBuy(context: StrategyMarketContext) {
  const { indicators, market, profile } = context;
  const trend = indicators.ema9 !== null && indicators.ema21 !== null && indicators.ema9 > indicators.ema21 ? profile.trendWeight : 0;
  const momentum = indicators.momentum5 !== null && indicators.momentum5 > 0 ? profile.momentumWeight : 0;
  const volume = indicators.relativeVolume !== null && indicators.relativeVolume >= 1 ? profile.volumeWeight : 0;
  const marketContext = market.spyTrend === "BULLISH" && market.qqqTrend === "BULLISH" ? profile.marketContextWeight : 0;
  const volatilityPenalty = market.regime === "HIGH_VOLATILITY" ? profile.volatilityPenalty : 0;
  return Math.max(0, trend + momentum + volume + marketContext - volatilityPenalty);
}

export function evaluateTrendStrategy(context: StrategyMarketContext): StrategySignal {
  const { indicators } = context;
  const bullishTrend = indicators.ema9 !== null && indicators.ema21 !== null && indicators.ema9 > indicators.ema21;
  const bearishTrend = indicators.ema9 !== null && indicators.ema21 !== null && indicators.ema9 < indicators.ema21;
  const bearishMomentum = indicators.momentum5 !== null && indicators.momentum5 < 0;
  const score = scoreBuy(context);
  const reasons: string[] = [];
  if (bullishTrend) reasons.push("EMA9 above EMA21");
  if (indicators.momentum5 !== null && indicators.momentum5 > 0) reasons.push("positive 5-minute momentum");
  if (indicators.relativeVolume !== null && indicators.relativeVolume >= 1) reasons.push("relative volume above baseline");
  if (context.market.spyTrend === "BULLISH" && context.market.qqqTrend === "BULLISH") reasons.push("SPY and QQQ are bullish");

  if (context.hasPosition && bearishTrend && bearishMomentum) {
    return { action: "SELL", confidence: Math.round(Math.min(1, 0.7 + Math.abs(indicators.momentum5 ?? 0)) * 100), reason: "EMA9 below EMA21 with negative momentum; exit to protect capital", payload: { strategy: "trend-v1", score, reasons: ["EMA9 below EMA21", "negative 5-minute momentum"] } };
  }
  if (!context.hasPosition && score >= context.profile.minimumSignalScore) {
    return { action: "BUY", confidence: Math.round(score * 100), reason: reasons.join("; "), payload: { strategy: "trend-v1", score, reasons } };
  }
  return { action: "HOLD", confidence: Math.round(score * 100), reason: `Signal score ${score.toFixed(2)} does not meet ${context.profile.id} entry threshold`, payload: { strategy: "trend-v1", score, reasons } };
}
