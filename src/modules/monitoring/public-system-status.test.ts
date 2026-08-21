import { describe, expect, it } from "vitest";
import { toPublicSystemStatus } from "./public-system-status";

describe("public system status payload", () => {
  it("returns the same safe aggregate status used by the dashboard with an automation-friendly overall state", () => {
    const payload = toPublicSystemStatus({
      checkedAt: new Date("2026-08-21T12:00:00.000Z"),
      bots: { on: 2, off: 1, dead: 0 },
      services: [
        { id: "web", label: "Web application", state: "healthy", detail: "Serving status." },
        { id: "database", label: "MySQL database", state: "healthy", detail: "Connected." },
        { id: "worker", label: "Worker", state: "warning", detail: "Heartbeat is stale." }
      ]
    });

    expect(payload).toEqual(expect.objectContaining({ status: "warning", checkedAt: "2026-08-21T12:00:00.000Z", bots: { on: 2, off: 1, dead: 0 } }));
    expect(payload.services).toHaveLength(3);
  });

  it("never serializes secrets or notification destinations", () => {
    const payload = toPublicSystemStatus({
      checkedAt: new Date("2026-08-21T12:00:00.000Z"),
      bots: { on: 0, off: 0, dead: 0 },
      services: [{ id: "webhook", label: "Webhooks", state: "disabled", detail: "Webhook alerts are disabled." }]
    });

    expect(JSON.stringify(payload)).not.toMatch(/key|secret|token|ciphertext|webhook\.example/i);
  });
});
