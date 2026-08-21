import { describe, expect, it } from "vitest";
import { planNotificationDeliveries, sanitizeNotificationDeliveryError } from "./notification-delivery";

const alert = {
  id: "alert-1",
  eventType: "SYSTEM_STATUS_FAILURE",
  severity: "CRITICAL",
  subject: "MySQL database needs attention",
  message: "Connection check failed.",
  firstObservedAt: new Date("2026-08-21T12:00:00.000Z"),
  lastObservedAt: new Date("2026-08-21T12:05:00.000Z"),
  webhookDeliveredAt: null,
  webhookLastAttemptAt: null,
  emailDeliveredAt: null,
  emailLastAttemptAt: null
};

describe("notification delivery planning", () => {
  it("redacts webhook destinations and recipient addresses from persisted delivery errors", () => {
    expect(sanitizeNotificationDeliveryError(new Error("POST https://hooks.example.test/super-secret failed for ops@example.test")))
      .toBe("POST [redacted-url] failed for [redacted-email]");
  });

  it("delivers one unsent operational alert only to enabled channels that selected its event", () => {
    expect(planNotificationDeliveries({
      alert,
      now: new Date("2026-08-21T12:06:00.000Z"),
      retryAfterMs: 10 * 60_000,
      webhook: { enabled: true, url: "https://hooks.example.test/braiker", events: ["SYSTEM_STATUS_FAILURE"] },
      email: { enabled: true, smtpConfigured: true, recipients: ["ops@example.test"], events: ["OPENAI_QUOTA_EXHAUSTED"] }
    })).toEqual([{ channel: "webhook", destination: "https://hooks.example.test/braiker" }]);
  });

  it("does not re-send a delivered alert or retry a recently failed delivery", () => {
    expect(planNotificationDeliveries({
      alert: { ...alert, webhookLastAttemptAt: new Date("2026-08-21T12:01:00.000Z") },
      now: new Date("2026-08-21T12:06:00.000Z"),
      retryAfterMs: 10 * 60_000,
      webhook: { enabled: true, url: "https://hooks.example.test/braiker", events: ["SYSTEM_STATUS_FAILURE"] },
      email: { enabled: false, smtpConfigured: false, recipients: [], events: [] }
    })).toEqual([]);
    expect(planNotificationDeliveries({
      alert: { ...alert, webhookDeliveredAt: new Date("2026-08-21T12:01:00.000Z") },
      now: new Date("2026-08-21T12:20:00.000Z"),
      retryAfterMs: 10 * 60_000,
      webhook: { enabled: true, url: "https://hooks.example.test/braiker", events: ["SYSTEM_STATUS_FAILURE"] },
      email: { enabled: false, smtpConfigured: false, recipients: [], events: [] }
    })).toEqual([]);
  });
});
