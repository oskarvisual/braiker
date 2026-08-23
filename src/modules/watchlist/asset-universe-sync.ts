import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

export type TradableAssetCatalogRow = { symbol: string; name: string; exchange: string };
export type AssetCatalogDatabase = { $executeRaw: (query: Prisma.Sql) => Promise<unknown> };
export const ASSET_CATALOG_SYNC_BATCH_SIZE = 250;

export class AssetCatalogPartialSyncError extends Error {
  constructor(readonly synced: number) {
    super("ASSET_CATALOG_PARTIAL_SYNC");
  }
}

function assetRows(assets: TradableAssetCatalogRow[], now: Date) {
  return assets.map((asset) => Prisma.sql`(${randomUUID()}, ${asset.symbol}, ${asset.name}, ${asset.exchange}, ${"us_equity"}, ${true}, ${true}, ${false}, ${now}, ${now}, ${now})`);
}

async function persistAssetBatch(assets: TradableAssetCatalogRow[], now: Date, db: AssetCatalogDatabase) {
  await db.$executeRaw(Prisma.sql`
    INSERT INTO \`TradableAsset\` (\`id\`, \`symbol\`, \`name\`, \`exchange\`, \`assetClass\`, \`active\`, \`tradable\`, \`enabled\`, \`syncedAt\`, \`createdAt\`, \`updatedAt\`)
    VALUES ${Prisma.join(assetRows(assets, now))}
    ON DUPLICATE KEY UPDATE
      \`name\` = VALUES(\`name\`),
      \`exchange\` = VALUES(\`exchange\`),
      \`assetClass\` = VALUES(\`assetClass\`),
      \`active\` = VALUES(\`active\`),
      \`tradable\` = VALUES(\`tradable\`),
      \`syncedAt\` = VALUES(\`syncedAt\`),
      \`updatedAt\` = VALUES(\`updatedAt\`)
  `);
}

export async function synchronizeTradableAssets({ assets, db, now = new Date(), batchSize = ASSET_CATALOG_SYNC_BATCH_SIZE }: { assets: TradableAssetCatalogRow[]; db: AssetCatalogDatabase; now?: Date; batchSize?: number }) {
  let synced = 0;
  for (let start = 0; start < assets.length; start += batchSize) {
    const batch = assets.slice(start, start + batchSize);
    try {
      await persistAssetBatch(batch, now, db);
      synced += batch.length;
    } catch {
      throw new AssetCatalogPartialSyncError(synced);
    }
  }
  return synced;
}
