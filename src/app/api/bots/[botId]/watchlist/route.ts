import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { normalizeEquitySymbol } from "@/modules/watchlist/symbol-policy";
import { ALLOWED_TRADING_SYMBOLS } from "@/modules/bots/bot-templates";

const addSchema = z.object({ symbol: z.string().min(1).max(32) });

async function authorizedBot(botId: string) {
  const user = await requireUser();
  const bot = await prisma.botInstance.findUnique({ where: { id: botId }, include: { wallet: { include: { members: { where: { userId: user.id } } } } } });
  if (!bot) throw new Error("BOT_NOT_FOUND");
  if (user.role !== "ADMIN" && bot.wallet.members.length === 0) throw new Error("FORBIDDEN");
  return { user, bot };
}

export async function GET(_: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    const { botId } = await context.params;
    await authorizedBot(botId);
    return NextResponse.json(await prisma.watchlist.findMany({ where: { botId }, orderBy: { symbol: "asc" } }));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 403 }); }
}

export async function POST(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    assertSameOrigin(request);
    const { botId } = await context.params;
    const { user, bot } = await authorizedBot(botId);
    if (user.role !== "ADMIN" && bot.wallet.members[0]?.role === "VIEWER") throw new Error("FORBIDDEN");
    const body = addSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_EQUITY_SYMBOL" }, { status: 400 });
    const symbol = normalizeEquitySymbol(body.data.symbol);
    const count = await prisma.watchlist.count({ where: { botId, enabled: true } });
    if (count >= ALLOWED_TRADING_SYMBOLS.length) return NextResponse.json({ error: "WATCHLIST_LIMIT_REACHED" }, { status: 400 });
    const item = await prisma.watchlist.upsert({ where: { botId_symbol: { botId, symbol } }, create: { botId, symbol }, update: { enabled: true } });
    await prisma.auditLog.create({ data: { userId: user.id, walletId: bot.walletId, action: "WATCHLIST_SYMBOL_ENABLED", target: symbol } });
    return NextResponse.json(item, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    assertSameOrigin(request);
    const { botId } = await context.params;
    const { user, bot } = await authorizedBot(botId);
    if (user.role !== "ADMIN" && bot.wallet.members[0]?.role === "VIEWER") throw new Error("FORBIDDEN");
    const symbol = normalizeEquitySymbol(new URL(request.url).searchParams.get("symbol") ?? "");
    await prisma.watchlist.update({ where: { botId_symbol: { botId, symbol } }, data: { enabled: false } });
    await prisma.auditLog.create({ data: { userId: user.id, walletId: bot.walletId, action: "WATCHLIST_SYMBOL_DISABLED", target: symbol } });
    return new NextResponse(null, { status: 204 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}
