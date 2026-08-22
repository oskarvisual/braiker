import { describe, expect, it } from "vitest";
import { planNotificationDeliveries, recordTelegramDeliveryTranscript, sanitizeNotificationDeliveryError } from "./notification-delivery";
import { vi } from "vitest";

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
  emailLastAttemptAt: null,
  telegramDeliveredAt: null,
  telegramLastAttemptAt: null
};

describe("notification delivery planning", () => {
  it("redacts webhook destinations and recipient addresses from persisted delivery errors", () => {
    expect(sanitizeNotificationDeliveryError(new Error("POST https://hooks.example.test/super-secret failed for ops@example.test")))
      .toBe("POST [redacted-url] failed for [redacted-email]");
  });

  it("redacts Telegram bot tokens from persisted delivery errors", () => {
    expect(sanitizeNotificationDeliveryError(new Error("Telegram 123456789:abcdefghijklmnopqrstuvwxyz_123456 failed")))
      .toBe("Telegram [redacted-telegram-token] failed");
  });

  it("delivers one unsent operational alert only to enabled channels that selected its event", () => {
    expect(planNotificationDeliveries({
      alert,
      now: new Date("2026-08-21T12:06:00.000Z"),
      retryAfterMs: 10 * 60_000,
      webhook: { enabled: true, url: "https://hooks.example.test/braiker", events: ["SYSTEM_STATUS_FAILURE"] },
      email: { enabled: true, smtpConfigured: true, recipients: ["ops@example.test"], events: ["OPENAI_QUOTA_EXHAUSTED"] },
      telegram: { managerEnabled: true, enabled: true, configured: true, paired: true, events: ["SYSTEM_STATUS_FAILURE"] }
    })).toEqual([
      { channel: "webhook", destination: "https://hooks.example.test/braiker" },
      { channel: "telegram", destination: "paired-bot-manager" }
    ]);
  });

  it("delivers a selected Bot Manager report to every enabled notification channel", () => {
    expect(planNotificationDeliveries({
      alert: { ...alert, id: "daily-report-1", eventType: "BOT_MANAGER_DAILY_REPORT" },
      now: new Date("2026-08-21T12:10:00.000Z"),
      retryAfterMs: 10 * 60_000,
      webhook: { enabled: true, url: "https://alerts.example.test/braiker", events: ["BOT_MANAGER_DAILY_REPORT"] },
      email: { enabled: true, smtpConfigured: true, recipients: ["owner@example.test"], events: ["BOT_MANAGER_DAILY_REPORT"] },
      telegram: { managerEnabled: true, enabled: true, configured: true, paired: true, events: ["BOT_MANAGER_DAILY_REPORT"] }
    })).toEqual([
      expect.objectContaining({ channel: "webhook" }),
      expect.objectContaining({ channel: "email" }),
      expect.objectContaining({ channel: "telegram" })
    ]);
  });

  it("does not re-send a delivered alert or retry a recently failed delivery", () => {
    expect(planNotificationDeliveries({
      alert: { ...alert, webhookLastAttemptAt: new Date("2026-08-21T12:01:00.000Z") },
      now: new Date("2026-08-21T12:06:00.000Z"),
      retryAfterMs: 10 * 60_000,
      webhook: { enabled: true, url: "https://hooks.example.test/braiker", events: ["SYSTEM_STATUS_FAILURE"] },
      email: { enabled: false, smtpConfigured: false, recipients: [], events: [] },
      telegram: { managerEnabled: false, enabled: false, configured: false, paired: false, events: [] }
    })).toEqual([]);
    expect(planNotificationDeliveries({
      alert: { ...alert, webhookDeliveredAt: new Date("2026-08-21T12:01:00.000Z") },
      now: new Date("2026-08-21T12:20:00.000Z"),
      retryAfterMs: 10 * 60_000,
      webhook: { enabled: true, url: "https://hooks.example.test/braiker", events: ["SYSTEM_STATUS_FAILURE"] },
      email: { enabled: false, smtpConfigured: false, recipients: [], events: [] },
      telegram: { managerEnabled: false, enabled: false, configured: false, paired: false, events: [] }
    })).toEqual([]);
  });

  it("plans Telegram delivery without exposing the paired chat destination", () => {
    expect(planNotificationDeliveries({
      alert,
      now: new Date("2026-08-21T12:06:00.000Z"),
      retryAfterMs: 10 * 60_000,
      webhook: { enabled: false, url: null, events: [] },
      email: { enabled: false, smtpConfigured: false, recipients: [], events: [] },
      telegram: { managerEnabled: true, enabled: true, configured: true, paired: true, events: ["SYSTEM_STATUS_FAILURE"] }
    })).toEqual([{ channel: "telegram", destination: "paired-bot-manager" }]);
  });

  it("does not plan Telegram delivery when the master switch is off", () => {
    expect(planNotificationDeliveries({
      alert,
      now: new Date("2026-08-21T12:06:00.000Z"),
      retryAfterMs: 10 * 60_000,
      webhook: { enabled: false, url: null, events: [] },
      email: { enabled: false, smtpConfigured: false, recipients: [], events: [] },
      telegram: { managerEnabled: false, enabled: true, configured: true, paired: true, events: ["SYSTEM_STATUS_FAILURE"] }
    })).toEqual([]);
  });

  it("copies a delivered Telegram alert into the pinned Bot Manager operations session", async () => {
    const upsertSession = vi.fn().mockResolvedValue({ id: "operations" });
    const upsertMessage = vi.fn().mockResolvedValue({ id: "message" });
    await recordTelegramDeliveryTranscript({ userId: "11111111-1111-4111-8111-111111111111", alert }, {
      managerChatSession: { upsert: upsertSession },
      managerChatMessage: { upsert: upsertMessage }
    } as never);

    expect(upsertSession).toHaveBeenCalled();
    expect(upsertMessage).toHaveBeenCalledWith(expect.objectContaining({
      where: { sourceReference: "telegram-alert:alert-1" },
      create: expect.objectContaining({ role: "SYSTEM", source: "TELEGRAM_ALERT" })
    }));
  });
});
