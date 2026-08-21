import type { MarketBar } from "@/modules/domain/contracts";

const values = (bars: MarketBar[]) => bars.map((bar) => Number(bar.close));

export function sma(bars: MarketBar[], period: number): number | null {
  if (period <= 0 || bars.length < period) return null;
  const sample = values(bars).slice(-period);
  return sample.reduce((total, value) => total + value, 0) / period;
}

export function ema(bars: MarketBar[], period: number): number | null {
  if (period <= 0 || bars.length < period) return null;
  const multiplier = 2 / (period + 1);
  return values(bars).slice(-period).reduce((previous, value, index) => index === 0 ? value : value * multiplier + previous * (1 - multiplier), 0);
}

export function momentum(bars: MarketBar[], period: number): number | null {
  if (period <= 0 || bars.length <= period) return null;
  const sample = values(bars);
  return (sample.at(-1)! - sample.at(-1 - period)!) / sample.at(-1 - period)!;
}
