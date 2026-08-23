import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { allocateMonthlyOperatingCosts } from "./operating-cost-service";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;
const policy = { maxPositionSize: "10", maxDailyLoss: "2", maxTradesPerDay: 4 };

describeMysql("monthly operating costs (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => {
    if (!db) return;
    await db.operatingCostAllocation.deleteMany();
    await db.botCapitalEvent.deleteMany();
    await db.botPosition.deleteMany();
    await db.botInstance.deleteMany();
    await db.wallet.deleteMany();
    await db.operatingCostSettings.deleteMany();
  });
  afterAll(async () => db?.$disconnect());

  it("charges each living bot once, preserves a reserved order envelope, and writes durable activity", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    const wallet = await db.wallet.create({ data: { name: `cost-wallet-${crypto.randomUUID()}` } });
    const [alpha, bravo] = await Promise.all([
      db.botInstance.create({ data: { walletId: wallet.id, name: `cost-alpha-${crypto.randomUUID()}`, riskPolicy: policy, strategyProfile: {}, initialCapital: "100", currentCapital: "100" } }),
      db.botInstance.create({ data: { walletId: wallet.id, name: `cost-bravo-${crypto.randomUUID()}`, riskPolicy: policy, strategyProfile: {}, initialCapital: "200", currentCapital: "200", reservedCapital: "190" } })
    ]);
    await db.operatingCostSettings.create({ data: { scope: "global", enabled: true, monthlyCost: "60" } });
    const at = new Date("2026-09-01T04:05:00.000Z");

    await expect(allocateMonthlyOperatingCosts(db, at)).resolves.toMatchObject({ enabled: true, chargedBots: 2 });
    await expect(allocateMonthlyOperatingCosts(db, at)).resolves.toMatchObject({ chargedBots: 0, skippedBots: 2 });
    const [afterAlpha, afterBravo] = await Promise.all([db.botInstance.findUniqueOrThrow({ where: { id: alpha.id } }), db.botInstance.findUniqueOrThrow({ where: { id: bravo.id } })]);
    expect(afterAlpha.currentCapital.toString()).toBe("80");
    expect(afterBravo.currentCapital.toString()).toBe("190");
    const allocations = await db.operatingCostAllocation.findMany({ where: { botId: { in: [alpha.id, bravo.id] } }, orderBy: { botId: "asc" } });
    expect(allocations).toHaveLength(2);
    expect(allocations.map((allocation) => allocation.unpaidAmount.toString()).sort()).toContain("30");
    expect(await db.botCapitalEvent.count({ where: { botId: alpha.id, kind: "OPERATING_COST" } })).toBe(1);
  });
});
