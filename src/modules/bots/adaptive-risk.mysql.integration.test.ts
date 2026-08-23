import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recordAdaptiveRiskAdjustment } from "./adaptive-risk-audit";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;
const basePolicy = { maxPositionSize: "10", maxPortfolioExposure: "35", maxDailyLoss: "2", maxWeeklyLoss: "6", maxTradesPerDay: 4, allowMargin: false, allowShorting: false, allowOptions: false, allowLeverage: false, marketOrderBufferPct: "0.02" };

describeMysql("adaptive bot risk (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => {
    await db?.botRiskAdjustment.deleteMany();
    await db?.botInstance.deleteMany();
    await db?.wallet.deleteMany();
  });
  afterAll(async () => db?.$disconnect());

  it("persists the opt-in setting and each changed effective survival posture", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    const wallet = await db.wallet.create({ data: { name: `adaptive-wallet-${crypto.randomUUID()}` } });
    const bot = await db.botInstance.create({ data: { walletId: wallet.id, name: `adaptive-bot-${crypto.randomUUID()}`, adaptiveRiskEnabled: true, riskPolicy: basePolicy, strategyProfile: {}, initialCapital: "100", currentCapital: "84" } });

    await expect(recordAdaptiveRiskAdjustment({ botId: bot.id, level: "CAUTIOUS", reason: "remaining capital below 85%", basePolicy, effectivePolicy: { ...basePolicy, maxPositionSize: "5", maxDailyLoss: "1", maxTradesPerDay: 2 } }, db)).resolves.toBe(true);
    await expect(recordAdaptiveRiskAdjustment({ botId: bot.id, level: "CAUTIOUS", reason: "remaining capital below 85%", basePolicy, effectivePolicy: { ...basePolicy, maxPositionSize: "5", maxDailyLoss: "1", maxTradesPerDay: 2 } }, db)).resolves.toBe(false);

    const persisted = await db.botRiskAdjustment.findMany({ where: { botId: bot.id } });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ level: "CAUTIOUS", basePolicy, effectivePolicy: expect.objectContaining({ maxPositionSize: "5", maxDailyLoss: "1" }) });
  });
});
