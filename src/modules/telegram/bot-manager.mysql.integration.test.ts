import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensureOperationsSession } from "@/modules/manager-chat/manager-chat-service";
import { hashTelegramPairingCode, mirrorWebManagerExchangeToTelegram, pollTelegramBotManager, type TelegramApi } from "./bot-manager";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;

describeMysql("Telegram Bot Manager persistence (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => {
    if (!db) return;
    await db.telegramManagerMessage.deleteMany();
    await db.telegramManagerSession.deleteMany();
    await db.telegramPairingCode.deleteMany();
    await db.telegramRuntimeState.deleteMany();
    await db.managerChatMessage.deleteMany();
    await db.managerChatSession.deleteMany();
    await db.notificationSettings.deleteMany();
    await db.user.deleteMany({ where: { email: { startsWith: "telegram-manager-test-" } } });
  });
  afterAll(async () => db?.$disconnect());

  it("consumes a pairing code once, persists a redacted transcript, and does not answer duplicate updates", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    const now = new Date("2026-08-21T12:00:00.000Z");
    const code = "safe-test-pairing-code";
    const user = await db.user.create({
      data: {
        email: `telegram-manager-test-${crypto.randomUUID()}@example.test`,
        passwordHash: "not-a-real-password",
        role: "ADMIN",
        mustChangePassword: false
      }
    });
    await db.notificationSettings.create({
      data: { scope: "global", webhookEvents: [], emailRecipients: [], emailEvents: [], telegramEvents: [], telegramReceiveMessages: true }
    });
    await db.telegramPairingCode.create({
      data: { codeHash: hashTelegramPairingCode(code), userId: user.id, expiresAt: new Date(now.getTime() + 60_000) }
    });
    const sent: Array<{ chatId: string; text: string }> = [];
    const api: TelegramApi = {
      getUpdates: async () => [{ updateId: "101", chatId: "1234567", text: `/start ${code}` }],
      sendMessage: async (chatId, text) => { sent.push({ chatId, text }); }
    };

    await expect(pollTelegramBotManager(now, { db, api, token: "synthetic-test-token" })).resolves.toEqual({ processed: 1 });
    await expect(pollTelegramBotManager(now, { db, api, token: "synthetic-test-token" })).resolves.toEqual({ processed: 0 });

    const [session, pairing, messages, runtime, managerSession] = await Promise.all([
      db.telegramManagerSession.findUniqueOrThrow({ where: { scope: "global" } }),
      db.telegramPairingCode.findUniqueOrThrow({ where: { codeHash: hashTelegramPairingCode(code) } }),
      db.telegramManagerMessage.findMany({ orderBy: { createdAt: "asc" } }),
      db.telegramRuntimeState.findUniqueOrThrow({ where: { scope: "global" } }),
      db.managerChatSession.findUniqueOrThrow({ where: { externalKey: `operations:${user.id}` } })
    ]);
    expect(session.telegramChatId).toBe("1234567");
    expect(pairing.consumedAt).toEqual(now);
    expect(messages.map((message) => message.content)).toEqual(["/start [redacted]", "Bot Manager paired. Use /help for read-only commands."]);
    expect(messages.some((message) => message.content.includes(code))).toBe(false);
    expect(runtime.nextUpdateId).toBe("102");
    expect(managerSession).toMatchObject({ userId: user.id, kind: "OPERATIONS", pinned: true, title: "Bot Manager · Operations" });
    expect(sent).toEqual([{ chatId: "1234567", text: "Bot Manager paired. Use /help for read-only commands." }]);
  });

  it("rejects ordinary Telegram messages until both pairing and message access are enabled", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    const sent: string[] = [];
    const api: TelegramApi = {
      getUpdates: async () => [{ updateId: "202", chatId: "unpaired-chat", text: "/status" }],
      sendMessage: async (_chatId, text) => { sent.push(text); }
    };

    await expect(pollTelegramBotManager(new Date("2026-08-21T12:00:00.000Z"), { db, api, token: "synthetic-test-token" })).resolves.toEqual({ processed: 0 });
    await expect(db.telegramManagerMessage.count()).resolves.toBe(0);
    expect(sent).toEqual([]);
  });

  it("writes a received Telegram question into the pinned Operations transcript without calling an external provider", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    const user = await db.user.create({
      data: {
        email: `telegram-manager-test-${crypto.randomUUID()}@example.test`,
        passwordHash: "not-a-real-password",
        role: "ADMIN",
        mustChangePassword: false
      }
    });
    await db.notificationSettings.create({ data: { scope: "global", webhookEvents: [], emailRecipients: [], emailEvents: [], telegramEvents: [], telegramReceiveMessages: true } });
    await db.telegramManagerSession.create({ data: { scope: "global", telegramChatId: "paired-chat", userId: user.id, linkedAt: new Date() } });
    const sent: string[] = [];
    const api: TelegramApi = {
      getUpdates: async () => [{ updateId: "303", chatId: "paired-chat", text: "Why did the latest scan skip a trade?" }],
      sendMessage: async (_chatId, text) => { sent.push(text); }
    };

    await expect(pollTelegramBotManager(new Date("2026-08-21T12:00:00.000Z"), { db, api, token: "synthetic-test-token", aiEnabled: false })).resolves.toEqual({ processed: 1 });

    const transcript = await db.managerChatSession.findUniqueOrThrow({
      where: { externalKey: `operations:${user.id}` },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    expect(transcript.messages.map((message) => [message.role, message.source, message.content])).toEqual([
      ["USER", "TELEGRAM", "Why did the latest scan skip a trade?"],
      ["ASSISTANT", "SYSTEM", expect.stringContaining("paused")]
    ]);
    expect(sent[0]).toContain("paused");
  });

  it("mirrors only the paired user's pinned browser Operations exchange and persists its Telegram audit trail", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    const user = await db.user.create({
      data: {
        email: `telegram-manager-test-${crypto.randomUUID()}@example.test`,
        passwordHash: "not-a-real-password",
        role: "ADMIN",
        mustChangePassword: false
      }
    });
    await db.telegramManagerSession.create({ data: { scope: "global", telegramChatId: "paired-chat", userId: user.id, linkedAt: new Date() } });
    const operations = await ensureOperationsSession(user.id, db);
    const sent: Array<{ chatId: string; text: string }> = [];
    const api: TelegramApi = {
      getUpdates: async () => [],
      sendMessage: async (chatId, text) => { sent.push({ chatId, text }); }
    };

    await expect(mirrorWebManagerExchangeToTelegram({
      userId: user.id,
      sessionId: operations.id,
      content: "Why did the latest scan skip a trade?",
      reply: "The candidate did not meet its risk threshold."
    }, { db, api, token: "synthetic-test-token" })).resolves.toEqual({ mirrored: true });

    await expect(db.telegramManagerMessage.findMany({ orderBy: { createdAt: "asc" } })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: "OUTBOUND", content: "Web · You:\nWhy did the latest scan skip a trade?" }),
      expect.objectContaining({ direction: "OUTBOUND", content: "BrAIker:\nThe candidate did not meet its risk threshold." })
    ]));
    expect(sent).toEqual([
      { chatId: "paired-chat", text: "Web · You:\nWhy did the latest scan skip a trade?" },
      { chatId: "paired-chat", text: "BrAIker:\nThe candidate did not meet its risk threshold." }
    ]);
  });
});
