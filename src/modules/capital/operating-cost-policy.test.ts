import { describe, expect, it } from "vitest";
import { allocateMonthlyOperatingCost, applyOperatingCostDebit } from "@/modules/capital/operating-cost-policy";

describe("monthly operating-cost policy", () => {
  it("allocates a configured monthly cost pro rata across living bots without rounding drift", () => {
    expect(allocateMonthlyOperatingCost({ monthlyCost: "50", bots: [
      { id: "alpha", currentCapital: "100" },
      { id: "bravo", currentCapital: "200" }
    ] })).toEqual([
      { botId: "alpha", allocatedAmount: "16.666666666666" },
      { botId: "bravo", allocatedAmount: "33.333333333334" }
    ]);
  });

  it("does not create allocations when the feature is disabled or living capital is zero", () => {
    expect(allocateMonthlyOperatingCost({ enabled: false, monthlyCost: "50", bots: [{ id: "alpha", currentCapital: "100" }] })).toEqual([]);
    expect(allocateMonthlyOperatingCost({ monthlyCost: "50", bots: [{ id: "alpha", currentCapital: "0" }] })).toEqual([]);
  });

  it("never debits reserved capital and marks death only after all cash and positions are gone", () => {
    expect(applyOperatingCostDebit({ currentCapital: "10", reservedCapital: "8", allocatedAmount: "5", openPositionCount: 0 }))
      .toEqual({ chargedAmount: "2.000000000000", unpaidAmount: "3.000000000000", capitalAfter: "8.000000000000", lifeStatus: "ACTIVE" });
    expect(applyOperatingCostDebit({ currentCapital: "10", reservedCapital: "0", allocatedAmount: "10", openPositionCount: 0 }))
      .toEqual({ chargedAmount: "10.000000000000", unpaidAmount: "0.000000000000", capitalAfter: "0.000000000000", lifeStatus: "DEAD" });
    expect(applyOperatingCostDebit({ currentCapital: "10", reservedCapital: "0", allocatedAmount: "10", openPositionCount: 1 }))
      .toMatchObject({ capitalAfter: "0.000000000000", lifeStatus: "ACTIVE" });
  });
});
