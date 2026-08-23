import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { synchronizeTradableAssets } from "./asset-universe-sync";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;

describeMysql("tradable asset catalog synchronization (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => { await db?.tradableAsset.deleteMany(); });
  afterAll(async () => db?.$disconnect());

  it("upserts independent batches without changing an Admin-selected asset back to disabled", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    await db.tradableAsset.create({ data: { symbol: "ALPHA", name: "Old Alpha", exchange: "NYSE", assetClass: "us_equity", enabled: true, syncedAt: new Date("2026-08-22T00:00:00.000Z") } });

    await expect(synchronizeTradableAssets({ assets: [{ symbol: "ALPHA", name: "Alpha Incorporated", exchange: "NASDAQ" }, { symbol: "BETA", name: "Beta Incorporated", exchange: "NYSE" }], db, now: new Date("2026-08-23T12:00:00.000Z"), batchSize: 1 })).resolves.toBe(2);

    await expect(db.tradableAsset.findMany({ orderBy: { symbol: "asc" }, select: { symbol: true, name: true, exchange: true, enabled: true } })).resolves.toEqual([
      { symbol: "ALPHA", name: "Alpha Incorporated", exchange: "NASDAQ", enabled: true },
      { symbol: "BETA", name: "Beta Incorporated", exchange: "NYSE", enabled: false }
    ]);
  });
});
