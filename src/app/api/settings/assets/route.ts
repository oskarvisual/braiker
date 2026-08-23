import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { globalPaperBroker } from "@/modules/broker/global-paper";
import { filterTradableUsEquities, normalizeUniverseSymbols } from "@/modules/watchlist/asset-universe";
import { assetUniversePublicError } from "@/modules/watchlist/asset-universe-feedback";
import { buildAssetUniversePageQuery } from "@/modules/watchlist/asset-universe-query";
import { AssetCatalogPartialSyncError, synchronizeTradableAssets } from "@/modules/watchlist/asset-universe-sync";

async function requireAdmin() { const user = await requireUser(); if (user.role !== "ADMIN") throw new Error("FORBIDDEN"); return user; }

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const searchParams = new URL(request.url).searchParams;
    const enabledParameter = searchParams.get("enabled");
    if (enabledParameter !== "true" && enabledParameter !== "false") throw new Error("INVALID_ASSET_FILTER");
    const enabled = enabledParameter === "true";
    const query = buildAssetUniversePageQuery({ enabled, query: searchParams.get("q"), cursor: searchParams.get("cursor") });
    const [rows, total] = await Promise.all([
      prisma.tradableAsset.findMany(query),
      prisma.tradableAsset.count({ where: query.where })
    ]);
    const assets = rows.slice(0, 100);
    return NextResponse.json({ assets, nextCursor: rows.length > assets.length ? assets.at(-1)?.symbol ?? null : null, total });
  }
  catch (error) { const result = assetUniversePublicError(error); return NextResponse.json({ error: result.code }, { status: result.status }); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); await requireAdmin();
    const assets = filterTradableUsEquities(await globalPaperBroker().listUsEquities());
    const synced = await synchronizeTradableAssets({ assets, db: prisma, now: new Date() });
    return NextResponse.json({ synced });
  } catch (error) {
    const result = assetUniversePublicError(error);
    return NextResponse.json({ error: result.code, ...(error instanceof AssetCatalogPartialSyncError ? { synced: error.synced } : {}) }, { status: result.status });
  }
}

const updateSchema = z.object({ symbol: z.string().min(1).max(16), enabled: z.boolean() });
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireAdmin(); const body = updateSchema.parse(await request.json()); const [symbol] = normalizeUniverseSymbols([body.symbol]); if (!symbol) throw new Error("INVALID_EQUITY_SYMBOL");
    const result = await prisma.$transaction(async (tx) => { const asset = await tx.tradableAsset.update({ where: { symbol }, data: { enabled: body.enabled } }); const removed = body.enabled ? 0 : (await tx.watchlist.deleteMany({ where: { symbol } })).count; await tx.auditLog.create({ data: { userId: user.id, action: body.enabled ? "GLOBAL_ASSET_ENABLED" : "GLOBAL_ASSET_DISABLED", target: symbol, metadata: { removedWatchlists: removed } } }); return { asset, removed }; });
    return NextResponse.json({ symbol: result.asset.symbol, enabled: result.asset.enabled, removedWatchlists: result.removed });
  } catch (error) { const result = assetUniversePublicError(error); return NextResponse.json({ error: result.code }, { status: result.status }); }
}
