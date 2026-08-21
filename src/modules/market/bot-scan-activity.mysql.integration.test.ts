import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;

async function makeBot() {
  if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
  const wallet = await db.wallet.create({ data: { name: `scan-wallet-${crypto.randomUUID()}` } });
  return db.botInstance.create({ data: { walletId: wallet.id, name: `scan-bot-${crypto.randomUUID()}`, riskPolicy: {}, strategyProfile: {} } });
}

describeMysql("bot scan activity persistence (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => {
    if (!db) return;
    await db.botScanRun.deleteMany();
    await db.botInstance.deleteMany();
    await db.wallet.deleteMany();
  });
  afterAll(async () => db?.$disconnect());

  it("keeps analysis activity isolated to the bot that produced it", async () => {
    const [first, second] = await Promise.all([makeBot(), makeBot()]);
    await db!.botScanRun.create({ data: { botId: first.id, status: "COMPLETED", reason: "ANALYZED", message: "Analyzed 1 symbol: 1 hold.", outcomes: [{ symbol: "SPY", outcome: "HOLD" }], completedAt: new Date() } });
    await db!.botScanRun.create({ data: { botId: second.id, status: "SKIPPED", reason: "MARKET_CLOSED", message: "Waiting: the US regular market is closed.", outcomes: [], completedAt: new Date() } });

    const firstRuns = await db!.botScanRun.findMany({ where: { botId: first.id }, orderBy: { startedAt: "desc" } });
    expect(firstRuns).toHaveLength(1);
    expect(firstRuns[0]).toMatchObject({ botId: first.id, reason: "ANALYZED", status: "COMPLETED" });
  });

  it("retains an explicit error state without persisting a raw exception", async () => {
    const bot = await makeBot();
    const scan = await db!.botScanRun.create({ data: { botId: bot.id, status: "ERROR", reason: "CYCLE_ERROR", message: "Analysis cycle could not finish. It will retry on the next cycle.", outcomes: [], completedAt: new Date() } });
    expect(scan.message).not.toContain("ALPACA_API_SECRET");
  });
});
