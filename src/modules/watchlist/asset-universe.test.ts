import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBAL_TRADING_SYMBOLS, filterTradableUsEquities, normalizeUniverseSymbols } from "./asset-universe";

describe("global asset universe", () => {
  it("keeps the familiar initial symbols enabled before the first Alpaca refresh", () => {
    expect(DEFAULT_GLOBAL_TRADING_SYMBOLS).toEqual(["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD"]);
  });

  it("only accepts active, tradable, non-OTC US equities from Alpaca", () => {
    expect(filterTradableUsEquities([
      { symbol: "SPY", name: "SPDR S&P 500 ETF", class: "us_equity", exchange: "ARCA", status: "active", tradable: true },
      { symbol: "OTCQ", name: "OTC example", class: "us_equity", exchange: "OTC", status: "active", tradable: true },
      { symbol: "HALT", name: "Halted", class: "us_equity", exchange: "NYSE", status: "active", tradable: false },
      { symbol: "BTC/USD", name: "Bitcoin", class: "crypto", exchange: "CRYPTO", status: "active", tradable: true }
    ])).toEqual([{ symbol: "SPY", name: "SPDR S&P 500 ETF", exchange: "ARCA" }]);
  });

  it("normalizes a requested bot watchlist without duplicates", () => {
    expect(normalizeUniverseSymbols([" spy ", "QQQ", "SPY"])).toEqual(["SPY", "QQQ"]);
  });
});
