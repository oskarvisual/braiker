import { describe, expect, it } from "vitest";
import { deriveStatusFailureAlerts } from "./operational-alerts";

describe("operational alerts", () => {
  it("opens one deduplicated alert per unhealthy operational dependency", () => {
    const alerts = deriveStatusFailureAlerts({
      services: [
        { id: "worker", label: "Worker", state: "warning", detail: "Heartbeat is stale." },
        { id: "database", label: "MySQL database", state: "unavailable", detail: "Connection check failed." },
        { id: "openai", label: "OpenAI / AI", state: "configured", detail: "Configured." },
        { id: "smtp", label: "Email / SMTP", state: "disabled", detail: "SMTP is not configured." }
      ]
    });

    expect(alerts).toEqual([
      expect.objectContaining({ dedupeKey: "status:worker", eventType: "SYSTEM_STATUS_FAILURE", severity: "WARNING" }),
      expect.objectContaining({ dedupeKey: "status:database", eventType: "SYSTEM_STATUS_FAILURE", severity: "CRITICAL" })
    ]);
  });

  it("does not alert for configured or intentionally disabled optional services", () => {
    expect(deriveStatusFailureAlerts({
      services: [
        { id: "openai", label: "OpenAI / AI", state: "configured", detail: "Configured." },
        { id: "smtp", label: "Email / SMTP", state: "disabled", detail: "Disabled." },
        { id: "webhook", label: "Webhooks", state: "disabled", detail: "Disabled." }
      ]
    })).toEqual([]);
  });
});
