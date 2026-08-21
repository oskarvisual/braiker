import { describe, expect, it } from "vitest";
import { orderHistoryState } from "./order-history";

describe("orderHistoryState", () => {
  it("classifies broker statuses into the user-facing history filters", () => {
    expect(orderHistoryState("new")).toBe("OPEN");
    expect(orderHistoryState("partially_filled")).toBe("IN_PROGRESS");
    expect(orderHistoryState("filled")).toBe("CLOSED");
    expect(orderHistoryState("rejected")).toBe("REJECTED");
  });

  it("keeps unknown pending statuses visible instead of marking them as closed", () => {
    expect(orderHistoryState("pending_risk")).toBe("OPEN");
  });
});
