import { describe, expect, it } from "vitest";
import { hasOlderHistoryForTab } from "./bot-history-pagination";

describe("bot history pagination", () => {
  const availability = { orders: true, scans: true, adjustments: true, operatingCosts: true };

  it("only exposes Load older history for the active tab's own paginated data", () => {
    expect(hasOlderHistoryForTab("operations", availability)).toBe(true);
    expect(hasOlderHistoryForTab("analysis", availability)).toBe(true);
    expect(hasOlderHistoryForTab("adaptive", availability)).toBe(true);
    expect(hasOlderHistoryForTab("assets", availability)).toBe(false);
    expect(hasOlderHistoryForTab("chats", availability)).toBe(false);
  });

  it("does not expose another tab's remaining pages", () => {
    const onlyOrdersHaveMore = { orders: true, scans: false, adjustments: false, operatingCosts: false };

    expect(hasOlderHistoryForTab("operations", onlyOrdersHaveMore)).toBe(true);
    expect(hasOlderHistoryForTab("analysis", onlyOrdersHaveMore)).toBe(false);
    expect(hasOlderHistoryForTab("adaptive", onlyOrdersHaveMore)).toBe(false);
  });
});
