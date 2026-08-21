import { describe, expect, it } from "vitest";
import { parseAlpacaBars, parseAlpacaQuote } from "@/modules/market/alpaca-market-data";

describe("Alpaca market-data contract parsing", () => {
  it("normalizes a one-minute bar without retaining provider-only field names", () => {
    expect(parseAlpacaBars("AAPL", { bars: [{ t: "2026-01-02T15:30:00Z", o: 100, h: 102, l: 99, c: 101, v: 1234, n: 55, vw: 100.5 }] }, "iex")).toEqual([expect.objectContaining({ symbol: "AAPL", timeframe: "1Min", close: "101", tradeCount: 55, vwap: "100.5" })]);
  });

  it("normalizes an Alpaca latest quote and preserves its provider timestamp", () => {
    expect(parseAlpacaQuote("AAPL", { quote: { bp: 100.1, ap: 100.2, t: "2026-01-02T15:31:00Z" } }, "iex")).toMatchObject({ symbol: "AAPL", bid: "100.1", ask: "100.2", feed: "iex" });
  });
});
