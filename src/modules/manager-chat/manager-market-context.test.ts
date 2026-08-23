import { describe, expect, it } from "vitest";
import { managerMarketClockContext } from "./manager-market-context";

describe("Manager market-clock context", () => {
  it("reports the next opening when Alpaca says the market is closed", () => {
    expect(managerMarketClockContext({ isOpen: false, timestamp: new Date("2026-08-23T16:00:00.000Z"), nextOpen: new Date("2026-08-24T13:30:00.000Z"), nextClose: new Date("2026-08-24T20:00:00.000Z") }))
      .toMatchObject({ status: "CLOSED", nextOpen: "2026-08-24T13:30:00.000Z" });
  });

  it("returns an explicit unknown state when the broker clock is unavailable", () => {
    expect(managerMarketClockContext(null)).toEqual({ status: "UNKNOWN" });
  });
});
