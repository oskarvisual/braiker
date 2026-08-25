import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;

describeMysql("bot import receipt (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => {
    if (!db) return;
    await db.botImportReceipt.deleteMany();
    await db.botInstance.deleteMany();
    await db.wallet.deleteMany();
    await db.user.deleteMany({ where: { email: { startsWith: "bot-import-" } } });
  });
  afterAll(async () => db?.$disconnect());

  it("persists a sanitized receipt once for a fresh paused import target", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    const user = await db.user.create({ data: { email: `bot-import-${crypto.randomUUID()}@example.test`, passwordHash: "test", role: "ADMIN" } });
    const wallet = await db.wallet.create({ data: { name: `import-wallet-${crypto.randomUUID()}`, unallocatedCapital: "50", managedCapital: "50" } });
    const bot = await db.botInstance.create({ data: { walletId: wallet.id, name: `imported-${crypto.randomUUID()}`, status: "PAUSED", runMode: "OFF", killSwitch: true, initialCapital: "50", currentCapital: "50", riskPolicy: { maxPositionSize: "10", maxDailyLoss: "2", maxTradesPerDay: 4 }, strategyProfile: {} } });
    await db.botImportReceipt.create({ data: { packageHash: "a".repeat(64), schemaVersion: 1, manifest: { kind: "braiker.bot.config", schemaVersion: 1, bot: { name: "portable" } }, importedById: user.id, botId: bot.id } });
    await expect(db.botImportReceipt.create({ data: { packageHash: "a".repeat(64), schemaVersion: 1, manifest: {}, importedById: user.id, botId: bot.id } })).rejects.toMatchObject({ code: "P2002" });
    await expect(db.botInstance.findUniqueOrThrow({ where: { id: bot.id } })).resolves.toMatchObject({ runMode: "OFF", status: "PAUSED", killSwitch: true });
  });
});
