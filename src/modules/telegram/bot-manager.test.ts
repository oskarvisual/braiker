import { describe, expect, it } from "vitest";
import {
  hashTelegramPairingCode,
  managerReplyForCommand,
  mirrorWebManagerExchangeToTelegram,
  parseTelegramConfirmation,
  parseTelegramControlCommand,
  redactTelegramInboundContent
} from "./bot-manager";

describe("Telegram Bot Manager", () => {
  it("hashes pairing codes and never keeps the raw start code in message history", () => {
    const code = "safe-test-pairing-code";
    expect(hashTelegramPairingCode(code)).not.toBe(code);
    expect(redactTelegramInboundContent(`/start ${code}`)).toBe("/start [redacted]");
  });

  it("redacts a Telegram token pasted into a Bot Manager message before persistence", () => {
    expect(redactTelegramInboundContent("Please use 123456789:abcdefghijklmnopqrstuvwxyz_123456 for alerts"))
      .toBe("Please use [redacted-telegram-token] for alerts");
  });

  it("only provides read-only management replies", () => {
    expect(managerReplyForCommand("/status")).toContain("read-only");
    expect(managerReplyForCommand("turn all bots off")).toContain("cannot change");
    expect(managerReplyForCommand("/help")).toContain("/off");
  });

  it("recognizes only explicit one-bot proposal and confirmation commands", () => {
    expect(parseTelegramControlCommand("/off 11111111-1111-4111-8111-111111111111")).toEqual({ action: "TURN_OFF", botId: "11111111-1111-4111-8111-111111111111" });
    expect(parseTelegramControlCommand("/off all")).toBeNull();
    expect(parseTelegramConfirmation("CONFIRMAR A1B2C3D4E5F6")).toBe("A1B2C3D4E5F6");
    expect(redactTelegramInboundContent("CONFIRMAR A1B2C3D4E5F6")).toBe("CONFIRMAR [redacted]");
  });

  it("mirrors a web message and BrAIker reply from the pinned Operations session to its paired Telegram chat", async () => {
    const sent: Array<{ chatId: string; text: string }> = [];
    const created: unknown[] = [];
    const db = {
      telegramManagerSession: { findUnique: async () => ({ telegramChatId: "paired-chat", userId: "admin-1" }) },
      managerChatSession: { upsert: async () => ({ id: "operations-1" }) },
      telegramManagerMessage: { create: async ({ data }: { data: unknown }) => { created.push(data); return data; } }
    };

    await expect(mirrorWebManagerExchangeToTelegram({
      userId: "admin-1",
      sessionId: "operations-1",
      content: "Why did the latest scan skip a trade?",
      reply: "The candidate did not meet its risk threshold."
    }, {
      db: db as never,
      token: "synthetic-test-token",
      api: { getUpdates: async () => [], sendMessage: async (chatId, text) => { sent.push({ chatId, text }); } }
    })).resolves.toEqual({ mirrored: true });

    expect(sent).toEqual([
      { chatId: "paired-chat", text: "Web · You:\nWhy did the latest scan skip a trade?" },
      { chatId: "paired-chat", text: "BrAIker:\nThe candidate did not meet its risk threshold." }
    ]);
    expect(created).toHaveLength(2);
  });

  it("does not mirror a regular browser conversation to Telegram", async () => {
    const sendMessage = async () => { throw new Error("Telegram must not be called"); };
    const db = {
      telegramManagerSession: { findUnique: async () => ({ telegramChatId: "paired-chat", userId: "admin-1" }) },
      managerChatSession: { upsert: async () => ({ id: "operations-1" }) },
      telegramManagerMessage: { create: async () => { throw new Error("Telegram must not be persisted"); } }
    };

    await expect(mirrorWebManagerExchangeToTelegram({
      userId: "admin-1",
      sessionId: "manual-1",
      content: "Keep this conversation private.",
      reply: "Understood."
    }, {
      db: db as never,
      token: "synthetic-test-token",
      api: { getUpdates: async () => [], sendMessage }
    })).resolves.toEqual({ mirrored: false });
  });
});
