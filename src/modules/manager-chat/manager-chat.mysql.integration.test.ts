import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appendManagerAlert, ensureOperationsSession, listManagerConversations } from "./manager-chat-service";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;

describeMysql("Bot Manager transcript persistence (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => {
    if (!db) return;
    await db.managerChatMessage.deleteMany();
    await db.managerChatSession.deleteMany();
    await db.user.deleteMany({ where: { email: { startsWith: "manager-chat-test-" } } });
  });
  afterAll(async () => db?.$disconnect());

  it("isolates conversations per user and de-duplicates a retried Telegram alert in the pinned Operations session", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    const [owner, otherUser] = await Promise.all([
      db.user.create({ data: { email: `manager-chat-test-${crypto.randomUUID()}@example.test`, passwordHash: "not-a-real-password", role: "ADMIN", mustChangePassword: false } }),
      db.user.create({ data: { email: `manager-chat-test-${crypto.randomUUID()}@example.test`, passwordHash: "not-a-real-password", role: "ADMIN", mustChangePassword: false } })
    ]);

    const [first, second] = await Promise.all([
      appendManagerAlert({ userId: owner.id, alertId: "alert-retry-safe", subject: "Worker stale", message: "The worker has not checked in." }, db),
      appendManagerAlert({ userId: owner.id, alertId: "alert-retry-safe", subject: "Worker stale", message: "The worker has not checked in." }, db)
    ]);
    const [ownerSessions, otherSessions, ownerOperations] = await Promise.all([
      listManagerConversations(owner.id, db),
      listManagerConversations(otherUser.id, db),
      ensureOperationsSession(owner.id, db)
    ]);

    expect(first.id).toBe(second.id);
    expect(ownerSessions).toHaveLength(1);
    expect(ownerSessions[0]).toMatchObject({ id: ownerOperations.id, kind: "OPERATIONS", pinned: true });
    expect(ownerSessions[0]?.messages).toHaveLength(1);
    expect(otherSessions).toHaveLength(1);
    expect(otherSessions[0]?.messages).toHaveLength(0);
  });
});
