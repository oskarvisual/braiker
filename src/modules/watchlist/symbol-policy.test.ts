import { describe, expect, it } from "vitest";
import { normalizeEquitySymbol } from "@/modules/watchlist/symbol-policy";

describe("normalizeEquitySymbol", () => {
  it("accepts and normalizes symbols in the initial approved universe", () => {
    expect(normalizeEquitySymbol(" spy ")).toBe("SPY");
    expect(normalizeEquitySymbol("nvda")).toBe("NVDA");
  });

  it("rejects crypto-style pairs and malformed symbols", () => {
    expect(() => normalizeEquitySymbol("BTC/USD")).toThrow("EQUITIES_ETFS_ONLY");
    expect(() => normalizeEquitySymbol("$AAPL")).toThrow("INVALID_EQUITY_SYMBOL");
  });

  it("rejects valid equities outside the intentionally small initial universe", () => {
    expect(() => normalizeEquitySymbol("BRK.B")).toThrow("SYMBOL_NOT_IN_INITIAL_UNIVERSE");
  });
});
