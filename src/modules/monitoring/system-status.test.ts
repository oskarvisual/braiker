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
      notificationSettings: async () => ({ webhookEnabled: true, encryptedWebhookUrl: "ciphertext", emailEnabled: true, telegramManagerEnabled: true, telegramEnabled: true, telegramReceiveMessages: true }),
      telegramManagerSession: async () => ({ scope: "global" }),
      openAiQuotaAlert: async () => false,
      openAiRuntimeState: async () => ({ status: "ACTIVE", disabledAt: null, lastCheckedAt: null }),
      botCounts: async () => ({ on: 2, off: 1, dead: 1 }),
      config: { aiEnabled: false, smtpConfigured: true, telegramConfigured: true }
    });

    expect(status.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "web", state: "healthy" }),
      expect.objectContaining({ id: "database", state: "healthy" }),
      expect.objectContaining({ id: "worker", state: "healthy" }),
      expect.objectContaining({ id: "alpaca", state: "healthy" }),
      expect.objectContaining({ id: "market-stream", state: "healthy" }),
      expect.objectContaining({ id: "openai", state: "disabled" }),
      expect.objectContaining({ id: "smtp", state: "configured" }),
      expect.objectContaining({ id: "webhook", state: "configured" }),
      expect.objectContaining({ id: "telegram", state: "configured" })
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
      notificationSettings: async () => ({ webhookEnabled: true, encryptedWebhookUrl: null, emailEnabled: false, telegramManagerEnabled: true, telegramEnabled: true, telegramReceiveMessages: false }),
      telegramManagerSession: async () => null,
      openAiQuotaAlert: async () => false,
      openAiRuntimeState: async () => ({ status: "ACTIVE", disabledAt: null, lastCheckedAt: null }),
      botCounts: async () => ({ on: 0, off: 3, dead: 0 }),
      config: { aiEnabled: true, smtpConfigured: false, telegramConfigured: true }
    });

    expect(status.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "database", state: "unavailable" }),
      expect.objectContaining({ id: "worker", state: "warning" }),
      expect.objectContaining({ id: "alpaca", state: "unavailable" }),
      expect.objectContaining({ id: "market-stream", state: "warning" }),
      expect.objectContaining({ id: "openai", state: "configured" }),
      expect.objectContaining({ id: "smtp", state: "disabled" }),
      expect.objectContaining({ id: "webhook", state: "warning" }),
      expect.objectContaining({ id: "telegram", state: "warning" })
    ]));
    expect(status.services.find((service) => service.id === "openai")?.detail).toContain("only when a candidate requires review");
  });

  it("reports Telegram disabled when its persisted master switch is off despite a configured token and pairing", async () => {
    const status = await getSystemStatus({
      now: () => now,
      databaseCheck: async () => undefined,
      workerHeartbeat: async () => now,
      alpacaHealth: async () => ({ healthy: true }),
      marketStreamHeartbeat: async () => now,
      notificationSettings: async () => ({ webhookEnabled: false, encryptedWebhookUrl: null, emailEnabled: false, telegramManagerEnabled: false, telegramEnabled: true, telegramReceiveMessages: true }),
      telegramManagerSession: async () => ({ scope: "global" }),
      openAiQuotaAlert: async () => false,
      openAiRuntimeState: async () => ({ status: "ACTIVE", disabledAt: null, lastCheckedAt: null }),
      botCounts: async () => ({ on: 0, off: 0, dead: 0 }),
      config: { aiEnabled: false, smtpConfigured: false, telegramConfigured: true }
    });

    expect(status.services).toContainEqual(expect.objectContaining({ id: "telegram", state: "disabled", detail: "Bot Manager on Telegram is disabled in Settings." }));
  });

  it("shows an OpenAI quota rejection as an actionable warning without exposing provider details", async () => {
    const status = await getSystemStatus({
      now: () => now,
      databaseCheck: async () => undefined,
      workerHeartbeat: async () => now,
      marketStreamHeartbeat: async () => now,
      alpacaHealth: async () => ({ healthy: true }),
      notificationSettings: async () => null,
      telegramManagerSession: async () => null,
      openAiQuotaAlert: async () => true,
      openAiRuntimeState: async () => ({ status: "QUOTA_EXHAUSTED", disabledAt: now, lastCheckedAt: now }),
      botCounts: async () => ({ on: 1, off: 0, dead: 0 }),
      config: { aiEnabled: true, smtpConfigured: false, telegramConfigured: false }
    });

    expect(status.services.find((service) => service.id === "openai")).toMatchObject({
      state: "warning",
      detail: expect.stringContaining("quota or billing")
    });
    expect(status.openAi).toEqual({ quotaPaused: true, reactivationAllowed: true });
    expect(JSON.stringify(status)).not.toContain("insufficient_quota");
  });
});
