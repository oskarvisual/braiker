import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { scheduleMarketCycleResume } from "@/modules/market/market-runner";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;

describeMysql("market-cycle closed-session scheduling (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => {
    if (!db) return;
    await db.scheduledTask.deleteMany({ where: { name: "market-cycle" } });
    await db.scheduledTask.create({ data: { name: "market-cycle", cronExpression: "*/1 * * * *" } });
  });
  afterAll(async () => db?.$disconnect());

  it("persists the next regular open and clears it once the market reopens", async () => {
    const nextOpen = new Date("2026-08-24T13:30:00.000Z");
    await scheduleMarketCycleResume(nextOpen, db!);
    expect((await db!.scheduledTask.findUniqueOrThrow({ where: { name: "market-cycle" } })).nextRunAt).toEqual(nextOpen);

    await scheduleMarketCycleResume(null, db!);
    expect((await db!.scheduledTask.findUniqueOrThrow({ where: { name: "market-cycle" } })).nextRunAt).toBeNull();
  });
});
