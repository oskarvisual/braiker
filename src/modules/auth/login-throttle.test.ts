import { describe, expect, it } from "vitest";
import { nextLoginThrottle } from "@/modules/auth/login-throttle";

describe("login throttling", () => {
  it("locks an identity after five failed attempts in the same window", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const result = nextLoginThrottle({ failures: 4, windowStartedAt: new Date("2026-08-20T11:59:00.000Z"), blockedUntil: null }, false, now, 5);
    expect(result).toMatchObject({ failures: 5, blockedUntil: new Date("2026-08-20T12:15:00.000Z") });
  });

  it("resets a stale window and clears a successful identity", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    expect(nextLoginThrottle({ failures: 4, windowStartedAt: new Date("2026-08-20T11:40:00.000Z"), blockedUntil: null }, false, now, 5)).toMatchObject({ failures: 1, blockedUntil: null });
    expect(nextLoginThrottle({ failures: 4, windowStartedAt: now, blockedUntil: null }, true, now, 5)).toMatchObject({ failures: 0, blockedUntil: null });
  });
});
