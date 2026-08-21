import { describe, expect, it } from "vitest";
import type { MarketBar } from "@/modules/domain/contracts";
import { atr, relativeVolume, rsi } from "@/modules/indicators/technical";

const bars = (closes: number[]): MarketBar[] => closes.map((close, index) => ({
  symbol: "AAPL",
  timeframe: "1Min",
  timestamp: new Date(Date.UTC(2026, 0, 1, 14, 30 + index)),
  open: String(index === 0 ? close : closes[index - 1]),
  high: String(close + 1),
  low: String(close - 1),
  close: String(close),
  volume: String(100 + index * 10),
  feed: "iex"
}));

describe("technical indicators", () => {
  it("calculates RSI from a reproducible candle window", () => {
    expect(rsi(bars([10, 11, 12, 11, 13, 14]), 5)).toBeCloseTo(83.3333333333, 8);
  });

  it("calculates ATR from high, low, and prior-close ranges", () => {
    expect(atr(bars([10, 12, 11, 14]), 3)).toBeCloseTo(3, 8);
  });

  it("compares the latest volume against its earlier baseline", () => {
    const sample = bars([10, 11, 12, 13, 14]);
    sample.at(-1)!.volume = "400";
    expect(relativeVolume(sample, 4)).toBeCloseTo(400 / 115, 8);
  });
});
