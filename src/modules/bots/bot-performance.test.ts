import { describe, expect, it } from "vitest";
import { calculateBotPerformance } from "./bot-performance";

describe("bot performance", () => {
  it("separates an original allocation and later cash flows from trading performance", () => {
    expect(calculateBotPerformance({
      initialCapital: "999",
      currentCapital: "65",
      assetValue: "90",
      positions: [{ quantity: "1", averageEntryPrice: "75" }],
      capitalEvents: [
        { kind: "ALLOCATION", amount: "100" },
        { kind: "TOP_UP", amount: "50" },
        { kind: "WITHDRAWAL", amount: "-10" },
        { kind: "BROKER_BUY_FILL", amount: "75" }
      ],
      realizedPnl: "5",
      operatingCosts: "5"
    })).toEqual({
      startingCapital: "100",
      netContributions: "140",
      liquidCapital: "65",
      assets: "90",
      equity: "155",
      realizedPnl: "5",
      unrealizedPnl: "15",
      tradingPnl: "20",
      operatingCosts: "5"
    });
  });

  it("withholds equity-derived performance when an open asset has no Alpaca valuation", () => {
    expect(calculateBotPerformance({
      initialCapital: "100",
      currentCapital: "20",
      assetValue: null,
      positions: [{ quantity: "1", averageEntryPrice: "80" }],
      capitalEvents: [{ kind: "ALLOCATION", amount: "100" }],
      realizedPnl: "0",
      operatingCosts: "0"
    })).toEqual(expect.objectContaining({
      startingCapital: "100",
      netContributions: "100",
      equity: null,
      unrealizedPnl: null,
      tradingPnl: null
    }));
  });
});
