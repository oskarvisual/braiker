import { describe, expect, it } from "vitest";
import { isIntervalCronDue, reconciliationCron } from "./schedule-policy";

describe("reconciliation schedule policy", () => {
  it("serializes only supported synchronization intervals", () => {
    expect(reconciliationCron(5)).toBe("*/5 * * * *");
    expect(() => reconciliationCron(2)).toThrow("Unsupported synchronization interval");
  });

  it("runs an interval task only when its UTC minute is due", () => {
    expect(isIntervalCronDue("*/15 * * * *", new Date("2026-08-20T12:30:00.000Z"))).toBe(true);
    expect(isIntervalCronDue("*/15 * * * *", new Date("2026-08-20T12:31:00.000Z"))).toBe(false);
  });
});
