import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { archiveBotChatSession, createManagerBotChatNote } from "./bot-chat-service";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;

describeMysql("bot chat sessions and daily context (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => {
    if (!db) return;
    await db.botDailyContext.deleteMany();
    await db.botChatMessage.deleteMany();
    await db.botChatSession.deleteMany();
    await db.botInstance.deleteMany({ where: { name: { startsWith: "bot-chat-test-" } } });
    await db.wallet.deleteMany({ where: { name: { startsWith: "bot-chat-wallet-" } } });
    await db.user.deleteMany({ where: { email: { startsWith: "bot-chat-test-" } } });
  });
  afterAll(async () => db?.$disconnect());

  it("persists a visible Manager note as bounded same-day context without a Telegram record", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    const user = await db.user.create({ data: { email: `bot-chat-test-${crypto.randomUUID()}@example.test`, passwordHash: "not-a-real-password", role: "ADMIN", mustChangePassword: false } });
    const wallet = await db.wallet.create({ data: { name: `bot-chat-wallet-${crypto.randomUUID()}` } });
    const bot = await db.botInstance.create({ data: { walletId: wallet.id, name: `bot-chat-test-${crypto.randomUUID()}`, riskPolicy: {}, strategyProfile: {}, runMode: "PAPER_ACTIVE", status: "RUNNING", killSwitch: false } });

    const session = await createManagerBotChatNote({ userId: user.id, botId: bot.id, content: "Defer new QQQ exposure until CPI is understood.", now: new Date("2026-08-22T12:00:00.000Z") }, db);
    const saved = await db.botChatSession.findUniqueOrThrow({ where: { id: session.id }, include: { messages: true } });
    const context = await db.botDailyContext.findFirstOrThrow({ where: { botId: bot.id } });

    expect(saved).toMatchObject({ userId: user.id, botId: bot.id, kind: "MANAGER_NOTE" });
    expect(saved.messages).toHaveLength(1);
    expect(context).toMatchObject({ source: "MANAGER_NOTE", messageId: saved.messages[0]?.id, content: "Defer new QQQ exposure until CPI is understood." });
  });

  it("archives a bot transcript without deleting its messages or daily context", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    const user = await db.user.create({ data: { email: `bot-chat-test-${crypto.randomUUID()}@example.test`, passwordHash: "not-a-real-password", role: "ADMIN", mustChangePassword: false } });
    const wallet = await db.wallet.create({ data: { name: `bot-chat-wallet-${crypto.randomUUID()}` } });
    const bot = await db.botInstance.create({ data: { walletId: wallet.id, name: `bot-chat-test-${crypto.randomUUID()}`, riskPolicy: {}, strategyProfile: {}, runMode: "PAPER_ACTIVE", status: "RUNNING", killSwitch: false } });
    const session = await createManagerBotChatNote({ userId: user.id, botId: bot.id, content: "Keep exposure cautious.", now: new Date("2026-08-22T12:00:00.000Z") }, db);

    await archiveBotChatSession({ userId: user.id, botId: bot.id, sessionId: session.id }, db);

    await expect(db.botChatSession.findUniqueOrThrow({ where: { id: session.id }, include: { messages: { include: { dailyContext: true } } } })).resolves.toMatchObject({ archivedAt: expect.any(Date), messages: [{ dailyContext: { content: "Keep exposure cautious." } }] });
  });
});
