import { describe, expect, it } from "vitest";
import { isIntervalCronDue, reconciliationCron } from "./schedule-policy";
import { retryLeaseRecoveryWrite } from "./lease-scheduler";

describe("reconciliation schedule policy", () => {
  it("serializes only supported synchronization intervals", () => {
    expect(reconciliationCron(5)).toBe("*/5 * * * *");
    expect(() => reconciliationCron(2)).toThrow("Unsupported synchronization interval");
  });

  it("runs an interval task only when its UTC minute is due", () => {
    expect(isIntervalCronDue("*/15 * * * *", new Date("2026-08-20T12:30:00.000Z"))).toBe(true);
    expect(isIntervalCronDue("*/15 * * * *", new Date("2026-08-20T12:31:00.000Z"))).toBe(false);
  });

  it("retries a transient MySQL write conflict without re-running a successful recovery", async () => {
    let attempts = 0;
    await retryLeaseRecoveryWrite(async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("deadlock"), { code: "P2034" });
    }, async () => undefined);
    expect(attempts).toBe(2);
  });

  it("does not hide a non-retryable lease recovery error", async () => {
    await expect(retryLeaseRecoveryWrite(async () => {
      throw new Error("database unavailable");
    }, async () => undefined)).rejects.toThrow("database unavailable");
  });
});
