import type { MarketBar } from "@/modules/domain/contracts";

const close = (bar: MarketBar) => Number(bar.close);
const high = (bar: MarketBar) => Number(bar.high);
const low = (bar: MarketBar) => Number(bar.low);
const volume = (bar: MarketBar) => Number(bar.volume);

export function rsi(bars: MarketBar[], period: number): number | null {
  if (period <= 0 || bars.length < period + 1) return null;
  const sample = bars.slice(-period - 1);
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < sample.length; index += 1) {
    const change = close(sample[index]) - close(sample[index - 1]);
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return 100;
  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

export function atr(bars: MarketBar[], period: number): number | null {
  if (period <= 0 || bars.length < period + 1) return null;
  const sample = bars.slice(-period - 1);
  const ranges = sample.slice(1).map((bar, index) => Math.max(
    high(bar) - low(bar),
    Math.abs(high(bar) - close(sample[index])),
    Math.abs(low(bar) - close(sample[index]))
  ));
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

export function relativeVolume(bars: MarketBar[], period: number): number | null {
  if (period <= 0 || bars.length < period + 1) return null;
  const baseline = bars.slice(-period - 1, -1).map(volume);
  const average = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
  return average > 0 ? volume(bars.at(-1)!) / average : null;
}
