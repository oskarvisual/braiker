import { describe, expect, it } from "vitest";
import { botCapitalBreakdown, positiveEquitySnapshots } from "./dashboard-metrics";

describe("bot capital breakdown", () => {
  it("aggregates the current capital of every visible bot separately from unassigned virtual wallet capital", () => {
    expect(botCapitalBreakdown({ wallets: [{ managedCapital: "100", unallocatedCapital: "0" }, { managedCapital: "300", unallocatedCapital: "50" }], botCapitals: ["100", "200", "50"] }))
      .toEqual({ currentBotCapital: "350", unallocatedCapital: "50", managedCapital: "400" });
  });

  it("drops invalid zero-equity history points before calculating the dashboard chart and P&L", () => {
    expect(positiveEquitySnapshots([{ capturedAt: "2026-08-18T00:00:00.000Z", equity: "0" }, { capturedAt: "2026-08-20T00:00:00.000Z", equity: "100000" }]))
      .toEqual([{ capturedAt: "2026-08-20T00:00:00.000Z", equity: "100000" }]);
  });
});
