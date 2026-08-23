import { describe, expect, it, vi } from "vitest";
import { AssetCatalogPartialSyncError, synchronizeTradableAssets } from "./asset-universe-sync";

const assets = Array.from({ length: 5 }, (_, index) => ({ symbol: `AST${index}`, name: `Asset ${index}`, exchange: "NASDAQ" }));

describe("tradable asset catalog synchronization", () => {
  it("persists the catalog in small atomic batches", async () => {
    const db = { $executeRaw: vi.fn().mockResolvedValue(1) };

    await expect(synchronizeTradableAssets({ assets, db, now: new Date("2026-08-23T12:00:00.000Z"), batchSize: 2 })).resolves.toBe(5);
    expect(db.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("retains completed batches and reports the partial count when a later batch fails", async () => {
    const db = { $executeRaw: vi.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("database unavailable")) };

    await expect(synchronizeTradableAssets({ assets, db, now: new Date("2026-08-23T12:00:00.000Z"), batchSize: 2 })).rejects.toMatchObject({ synced: 2 });
    expect(db.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("keeps the underlying failure private from the safe partial-sync error", () => {
    const error = new AssetCatalogPartialSyncError(250);

    expect(error.message).not.toContain("database");
    expect(error.synced).toBe(250);
  });
});
