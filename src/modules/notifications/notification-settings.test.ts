import { describe, expect, it } from "vitest";
import { notificationEvents, validateNotificationChannel } from "./notification-settings";

describe("notification settings", () => {
  it("defines the supported operational alerts", () => {
    expect(notificationEvents.map((event) => event.id)).toContain("ORDER_FILLED");
    expect(notificationEvents.map((event) => event.id)).toContain("SYNC_FAILED");
    expect(notificationEvents.map((event) => event.id)).toContain("SYSTEM_STATUS_FAILURE");
    expect(notificationEvents.map((event) => event.id)).toContain("OPENAI_QUOTA_EXHAUSTED");
  });

  it("rejects an enabled webhook without a secure URL and event selection", () => {
    expect(validateNotificationChannel({ enabled: true, url: "http://example.test/hook", events: [] })).toBe("A webhook needs an HTTPS URL and at least one alert.");
  });

  it("allows an enabled email channel with a recipient and selected alerts", () => {
    expect(validateNotificationChannel({ enabled: true, recipients: ["ops@example.test"], events: ["BOT_DEAD"] })).toBeNull();
  });
});
