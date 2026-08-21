import { describe, expect, it } from "vitest";
import { botLifeStatus, validateBudgetAllocation, validateCapitalAdjustment } from "@/modules/capital/capital-policy";

describe("isolated bot capital", () => {
  it("does not let allocations exceed the wallet's unassigned capital", () => {
    expect(validateBudgetAllocation({ unallocatedCapital: "50", requestedBudget: "50" })).toBeNull();
    expect(validateBudgetAllocation({ unallocatedCapital: "50", requestedBudget: "50.01" })).toBe("INSUFFICIENT_UNALLOCATED_CAPITAL");
  });

  it("rejects zero or negative starting budgets", () => {
    expect(validateBudgetAllocation({ unallocatedCapital: "100", requestedBudget: "0" })).toBe("INVALID_BOT_BUDGET");
    expect(validateBudgetAllocation({ unallocatedCapital: "100", requestedBudget: "-1" })).toBe("INVALID_BOT_BUDGET");
  });

  it("marks a bot as dead only when its own equity reaches zero", () => {
    expect(botLifeStatus("0")).toBe("DEAD");
    expect(botLifeStatus("0.000000000001")).toBe("ACTIVE");
    expect(botLifeStatus("50")).toBe("ACTIVE");
  });

  it("moves capital only within the wallet and leaves a live bot with capital", () => {
    expect(validateCapitalAdjustment({ direction: "ADD", walletUnallocatedCapital: "10", botCurrentCapital: "20", amount: "10" })).toBeNull();
    expect(validateCapitalAdjustment({ direction: "ADD", walletUnallocatedCapital: "10", botCurrentCapital: "20", amount: "10.01" })).toBe("INSUFFICIENT_UNALLOCATED_CAPITAL");
    expect(validateCapitalAdjustment({ direction: "WITHDRAW", walletUnallocatedCapital: "10", botCurrentCapital: "20", amount: "19.99" })).toBeNull();
    expect(validateCapitalAdjustment({ direction: "WITHDRAW", walletUnallocatedCapital: "10", botCurrentCapital: "20", amount: "20" })).toBe("WITHDRAWAL_MUST_LEAVE_CAPITAL");
  });
});
