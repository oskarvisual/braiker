import { describe, expect, it } from "vitest";
import { availablePaperCapital, validatePaperCapitalPool, validateVirtualWalletCapitalAdjustment } from "@/modules/wallets/paper-capital-pool";

describe("global Paper capital pool", () => {
  it("keeps virtual wallet allocations inside the enabled Paper capital", () => {
    expect(availablePaperCapital({ managedCapital: "500", allocatedCapital: "350" })).toBe("150");
  });

  it("rejects a new virtual wallet when the shared pool has no available capital", () => {
    expect(validatePaperCapitalPool({ managedCapital: "100", allocatedCapital: "100", requestedWalletCapital: "1", brokerCash: "100000" })).toBe("INSUFFICIENT_PAPER_CAPITAL");
  });

  it("rejects a configured Paper pool above currently available broker cash", () => {
    expect(validatePaperCapitalPool({ managedCapital: "100001", allocatedCapital: "0", requestedWalletCapital: "0", brokerCash: "100000" })).toBe("PAPER_CAPITAL_EXCEEDS_BROKER_CASH");
  });

  it("allows a virtual wallet from the shared pool without requiring a second broker connection", () => {
    expect(validatePaperCapitalPool({ managedCapital: "500", allocatedCapital: "350", requestedWalletCapital: "150", brokerCash: "100000" })).toBeNull();
  });

  it("moves only unassigned wallet capital back to the global pool", () => {
    expect(validateVirtualWalletCapitalAdjustment({ direction: "WITHDRAW", walletUnallocatedCapital: "25", globalAvailableCapital: "0", amount: "25" })).toBeNull();
    expect(validateVirtualWalletCapitalAdjustment({ direction: "WITHDRAW", walletUnallocatedCapital: "25", globalAvailableCapital: "0", amount: "25.01" })).toBe("WALLET_CAPITAL_ASSIGNED_TO_BOTS");
  });

  it("requires available global Paper capital when increasing a wallet budget", () => {
    expect(validateVirtualWalletCapitalAdjustment({ direction: "ADD", walletUnallocatedCapital: "0", globalAvailableCapital: "20", amount: "20" })).toBeNull();
    expect(validateVirtualWalletCapitalAdjustment({ direction: "ADD", walletUnallocatedCapital: "0", globalAvailableCapital: "20", amount: "20.01" })).toBe("INSUFFICIENT_PAPER_CAPITAL");
  });
});
