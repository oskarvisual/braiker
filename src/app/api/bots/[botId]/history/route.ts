import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { orderHistoryState } from "@/modules/history/order-history";

export async function GET(_: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    const user = await requireUser();
    const { botId } = await context.params;
    const bot = await prisma.botInstance.findUnique({ where: { id: botId }, include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } }, watchlist: { where: { enabled: true }, select: { symbol: true } }, botPositions: { where: { quantity: { gt: 0 } }, select: { id: true } } } });
    if (!bot || (user.role !== "ADMIN" && bot.wallet.members.length === 0)) return NextResponse.json({ error: "BOT_NOT_FOUND" }, { status: 404 });
    const proposals = await prisma.tradeProposal.findMany({ where: { botId }, select: { id: true } });
    const orders = await prisma.order.findMany({ where: { proposalId: { in: proposals.map((proposal) => proposal.id) } }, include: { fills: { select: { quantity: true, price: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({
      bot: { id: bot.id, name: bot.name, templateId: bot.templateId, avatarSeed: bot.avatarSeed, lifeStatus: bot.lifeStatus, runMode: bot.runMode, status: bot.status, killSwitch: bot.killSwitch, currentCapital: bot.currentCapital.toString(), initialCapital: bot.initialCapital.toString(), reservedCapital: bot.reservedCapital.toString(), openPositionCount: bot.botPositions.length, symbols: bot.watchlist.map((item) => item.symbol) },
      orders: orders.map((order) => { const filled = order.fills.reduce((total, fill) => total.plus(fill.quantity), new Prisma.Decimal(0)); return { id: order.id, action: order.action, symbol: order.symbol, orderType: order.orderType, quantity: order.quantity.toString(), filledQuantity: filled.toString(), averagePrice: order.fills[0]?.price?.toString() ?? null, status: order.status, historyState: orderHistoryState(order.status), createdAt: order.createdAt.toISOString() }; })
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 });
  }
}
