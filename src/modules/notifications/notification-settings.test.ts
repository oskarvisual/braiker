import { describe, expect, it } from "vitest";
import {
  notificationEvents,
  validateEmailNotificationChannel,
  validateNotificationChannel,
  validateTelegramManagerChannel,
  validateWebhookNotificationChannel,
} from "./notification-settings";

describe("notification settings", () => {
  it("defines the supported operational alerts", () => {
    expect(notificationEvents.map((event) => event.id)).toContain("ORDER_FILLED");
    expect(notificationEvents.map((event) => event.id)).toContain("SYNC_FAILED");
    expect(notificationEvents.map((event) => event.id)).toContain("SYSTEM_STATUS_FAILURE");
    expect(notificationEvents.map((event) => event.id)).toContain("OPENAI_QUOTA_EXHAUSTED");
    expect(notificationEvents.map((event) => event.id)).toContain("LEARNING_PROPOSAL");
    expect(notificationEvents.map((event) => event.id)).toContain("BOT_MANAGER_DAILY_REPORT");
    expect(notificationEvents.map((event) => event.id)).toContain("BOT_MANAGER_WEEKLY_REPORT");
    expect(notificationEvents.map((event) => event.id)).toContain("BOT_MANAGER_MONTHLY_REPORT");
  });

  it("rejects an enabled webhook without a secure URL and event selection", () => {
    expect(validateNotificationChannel({ enabled: true, url: "http://example.test/hook", events: [] })).toBe("Webhook alerts need an HTTPS URL and at least one alert.");
  });

  it("allows an enabled email channel with a recipient and selected alerts", () => {
    expect(validateNotificationChannel({ enabled: true, recipients: ["ops@example.test"], events: ["BOT_DEAD"] })).toBeNull();
  });

  it("explains when enabled email alerts have recipients but no selected event", () => {
    expect(
      validateEmailNotificationChannel({
        enabled: true,
        recipients: ["ops@example.test"],
        events: [],
      }),
    ).toBe("Select at least one email alert.");
  });

  it("does not validate inactive webhook details while email alerts are saved", () => {
    expect(
      validateWebhookNotificationChannel({
        enabled: false,
        url: "http://not-a-secure-webhook.example.test",
        events: [],
      }),
    ).toBeNull();
    expect(
      validateEmailNotificationChannel({
        enabled: true,
        recipients: ["alerts@example.test"],
        events: ["BOT_DEAD"],
      }),
    ).toBeNull();
  });

  it("rejects enabling the Telegram manager without a server token", () => {
    expect(validateTelegramManagerChannel({ enabled: true, configured: false }))
      .toBe("Telegram needs a server-side bot token before Bot Manager can be enabled.");
    expect(validateTelegramManagerChannel({ enabled: false, configured: false })).toBeNull();
  });
});
