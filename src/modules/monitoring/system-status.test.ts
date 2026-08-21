import { describe, expect, it } from "vitest";
import { getSystemStatus } from "./system-status";

const now = new Date("2026-08-21T12:00:00.000Z");

describe("system status", () => {
  it("reports the operational dependencies without exposing secrets", async () => {
    const status = await getSystemStatus({
      now: () => now,
      databaseCheck: async () => undefined,
      workerHeartbeat: async () => new Date("2026-08-21T11:59:20.000Z"),
      alpacaHealth: async () => ({ healthy: true }),
      marketStreamHeartbeat: async () => new Date("2026-08-21T11:59:30.000Z"),
      notificationSettings: async () => ({ webhookEnabled: true, encryptedWebhookUrl: "ciphertext", emailEnabled: true }),
      botCounts: async () => ({ on: 2, off: 1, dead: 1 }),
      config: { aiEnabled: false, smtpConfigured: true }
    });

    expect(status.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "web", state: "healthy" }),
      expect.objectContaining({ id: "database", state: "healthy" }),
      expect.objectContaining({ id: "worker", state: "healthy" }),
      expect.objectContaining({ id: "alpaca", state: "healthy" }),
      expect.objectContaining({ id: "market-stream", state: "healthy" }),
      expect.objectContaining({ id: "openai", state: "disabled" }),
      expect.objectContaining({ id: "smtp", state: "warning" }),
      expect.objectContaining({ id: "webhook", state: "warning" })
    ]));
    expect(status.services.find((service) => service.id === "openai")?.detail).toContain("advisory");
    expect(status.bots).toEqual({ on: 2, off: 1, dead: 1 });
    expect(JSON.stringify(status)).not.toContain("ciphertext");
  });

  it("marks stale or unavailable operational dependencies without treating configured AI as a verified provider call", async () => {
    const status = await getSystemStatus({
      now: () => now,
      databaseCheck: async () => { throw new Error("connection refused"); },
      workerHeartbeat: async () => new Date("2026-08-21T11:55:00.000Z"),
      alpacaHealth: async () => ({ healthy: false }),
      marketStreamHeartbeat: async () => new Date("2026-08-21T11:55:00.000Z"),
      notificationSettings: async () => ({ webhookEnabled: true, encryptedWebhookUrl: null, emailEnabled: false }),
      botCounts: async () => ({ on: 0, off: 3, dead: 0 }),
      config: { aiEnabled: true, smtpConfigured: false }
    });

    expect(status.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "database", state: "unavailable" }),
      expect.objectContaining({ id: "worker", state: "warning" }),
      expect.objectContaining({ id: "alpaca", state: "unavailable" }),
      expect.objectContaining({ id: "market-stream", state: "warning" }),
      expect.objectContaining({ id: "openai", state: "warning" }),
      expect.objectContaining({ id: "smtp", state: "disabled" }),
      expect.objectContaining({ id: "webhook", state: "warning" })
    ]));
    expect(status.services.find((service) => service.id === "openai")?.detail).toContain("not a live provider check");
  });
});
