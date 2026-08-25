import { describe, expect, it } from "vitest";
import { buildBotTransferPackage, parseBotTransferPackage, type BotTransferConfig } from "./bot-transfer";

const config: BotTransferConfig = {
  name: "Alpha",
  templateId: "NAVIGATOR" as const,
  avatarSeed: "compass",
  symbols: ["AAPL", "QQQ"],
  customInstructions: "Favor liquid setups.",
  adaptiveRiskEnabled: true,
  riskLimits: { maxPositionSize: "10", maxDailyLoss: "2", maxTradesPerDay: 4 },
  strategyProfile: { strategyId: "trend-v1", version: 1, minimumSignalScore: 0.65, trendWeight: 0.3, momentumWeight: 0.25, volumeWeight: 0.2, marketContextWeight: 0.15, volatilityPenalty: 0.1 },
  learnedInstructions: [
    { source: "MANAGER", content: "Wait for stronger confirmation after losses.", revision: 1, active: true, deactivatedAt: null, createdAt: "2026-08-20T00:00:00.000Z" },
    { source: "BOT_APPROVAL", content: "Do not chase gaps.", revision: 2, active: false, deactivatedAt: "2026-08-21T00:00:00.000Z", createdAt: "2026-08-20T01:00:00.000Z" }
  ]
};

describe("bot transfer package", () => {
  it("exports only portable configuration and every learning revision", () => {
    const packet = buildBotTransferPackage(config, new Date("2026-08-25T12:00:00.000Z"));

    expect(packet).toMatchObject({ kind: "braiker.bot.config", schemaVersion: 1, exportedAt: "2026-08-25T12:00:00.000Z", bot: config });
    expect(packet.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(packet.bot)).not.toEqual(expect.arrayContaining(["walletId", "initialCapital", "currentCapital", "reservedCapital", "positions", "orders", "fills", "killSwitch", "runMode", "lifeStatus", "aiProfile"]));
  });

  it("accepts a valid untampered packet and rejects a changed or unsupported one", () => {
    const packet = buildBotTransferPackage(config, new Date("2026-08-25T12:00:00.000Z"));
    expect(parseBotTransferPackage(packet)).toEqual(packet);
    expect(() => parseBotTransferPackage({ ...packet, schemaVersion: 2 })).toThrow("BOT_IMPORT_UNSUPPORTED_SCHEMA");
    expect(() => parseBotTransferPackage({ ...packet, bot: { ...packet.bot, name: "Changed" } })).toThrow("BOT_IMPORT_HASH_MISMATCH");
  });

  it("rejects incomplete instructions and duplicate revisions", () => {
    const packet = buildBotTransferPackage(config, new Date("2026-08-25T12:00:00.000Z"));
    expect(() => parseBotTransferPackage({ ...packet, bot: { ...packet.bot, symbols: [] } })).toThrow("BOT_IMPORT_INVALID_PACKAGE");
    const duplicate = { ...packet, bot: { ...packet.bot, learnedInstructions: [packet.bot.learnedInstructions[0], { ...packet.bot.learnedInstructions[0], content: "Other" }] } };
    expect(() => parseBotTransferPackage(duplicate)).toThrow("BOT_IMPORT_INVALID_PACKAGE");
  });
});
