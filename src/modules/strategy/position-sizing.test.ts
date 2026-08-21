import { describe, expect, it } from "vitest";
import { sizePosition } from "@/modules/strategy/position-sizing";

describe("position sizing", () => {
  it("never sizes a buy beyond the bot's free capital or its configured position cap", () => {
    expect(sizePosition({ price: "12", confidence: 90, availableCapital: "50", currentExposure: "0", maxPositionSize: "10", maxPortfolioExposure: "35" })).toEqual({ quantity: "0.750000000000", estimatedValue: "9.000000000000" });
  });

  it("returns no order when there is no free capital or portfolio room", () => {
    expect(sizePosition({ price: "10", confidence: 90, availableCapital: "0", currentExposure: "35", maxPositionSize: "10", maxPortfolioExposure: "35" })).toBeNull();
  });
});
