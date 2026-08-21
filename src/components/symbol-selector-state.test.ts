import { describe, expect, it } from "vitest";
import { selectedSymbolSummary } from "@/components/symbol-selector-state";

describe("selectedSymbolSummary", () => {
  it("shows the selected universe as a compact comma-separated summary", () => {
    expect(selectedSymbolSummary(["SPY", "QQQ", "AAPL"])).toBe("SPY, QQQ, AAPL");
  });

  it("explains the empty state without showing an empty selector", () => {
    expect(selectedSymbolSummary([])).toBe("Choose symbols");
  });
});
