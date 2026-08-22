import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { globalPaperBroker } from "@/modules/broker/global-paper";
import { filterTradableUsEquities, normalizeUniverseSymbols } from "@/modules/watchlist/asset-universe";

async function requireAdmin() { const user = await requireUser(); if (user.role !== "ADMIN") throw new Error("FORBIDDEN"); return user; }

export async function GET() {
  try { await requireAdmin(); return NextResponse.json(await prisma.tradableAsset.findMany({ orderBy: { symbol: "asc" }, take: 5000 })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 403 }); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); await requireAdmin();
    const assets = filterTradableUsEquities(await globalPaperBroker().listUsEquities()); const now = new Date();
    await prisma.$transaction(assets.map((asset) => prisma.tradableAsset.upsert({ where: { symbol: asset.symbol }, create: { ...asset, assetClass: "us_equity", active: true, tradable: true, enabled: false, syncedAt: now }, update: { ...asset, assetClass: "us_equity", active: true, tradable: true, syncedAt: now } })));
    return NextResponse.json({ synced: assets.length });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}

const updateSchema = z.object({ symbol: z.string().min(1).max(16), enabled: z.boolean() });
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireAdmin(); const body = updateSchema.parse(await request.json()); const [symbol] = normalizeUniverseSymbols([body.symbol]); if (!symbol) throw new Error("INVALID_EQUITY_SYMBOL");
    const result = await prisma.$transaction(async (tx) => { const asset = await tx.tradableAsset.update({ where: { symbol }, data: { enabled: body.enabled } }); const removed = body.enabled ? 0 : (await tx.watchlist.deleteMany({ where: { symbol } })).count; await tx.auditLog.create({ data: { userId: user.id, action: body.enabled ? "GLOBAL_ASSET_ENABLED" : "GLOBAL_ASSET_DISABLED", target: symbol, metadata: { removedWatchlists: removed } } }); return { asset, removed }; });
    return NextResponse.json({ symbol: result.asset.symbol, enabled: result.asset.enabled, removedWatchlists: result.removed });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}
