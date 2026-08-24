import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { orderHistoryState } from "@/modules/history/order-history";
import { pageResult, pageWindow } from "@/modules/pagination/page";

export async function GET(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    const user = await requireUser();
    const { botId } = await context.params;
    const bot = await prisma.botInstance.findUnique({ where: { id: botId }, include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } }, watchlist: { where: { enabled: true }, select: { symbol: true } }, botPositions: { where: { quantity: { gt: 0 } }, select: { id: true } } } });
    if (!bot || (user.role !== "ADMIN" && bot.wallet.members.length === 0)) return NextResponse.json({ error: "BOT_NOT_FOUND" }, { status: 404 });
    const { page, skip, take } = pageWindow(new URL(request.url).searchParams.get("page"));
    const [proposals, adjustmentRows, costRows] = await Promise.all([
      prisma.tradeProposal.findMany({ where: { botId }, select: { id: true } }),
      prisma.botRiskAdjustment.findMany({ where: { botId }, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.operatingCostAllocation.findMany({ where: { botId }, orderBy: { createdAt: "desc" }, skip, take })
    ]);
    const orderRows = await prisma.order.findMany({ where: { proposalId: { in: proposals.map((proposal) => proposal.id) } }, include: { fills: { select: { quantity: true, price: true } } }, orderBy: { createdAt: "desc" }, skip, take });
    const orders = pageResult(orderRows);
    const adjustments = pageResult(adjustmentRows);
    const operatingCosts = pageResult(costRows);
    return NextResponse.json({
      bot: { id: bot.id, name: bot.name, templateId: bot.templateId, avatarSeed: bot.avatarSeed, lifeStatus: bot.lifeStatus, runMode: bot.runMode, status: bot.status, killSwitch: bot.killSwitch, adaptiveRiskEnabled: bot.adaptiveRiskEnabled, currentCapital: bot.currentCapital.toString(), initialCapital: bot.initialCapital.toString(), reservedCapital: bot.reservedCapital.toString(), openPositionCount: bot.botPositions.length, symbols: bot.watchlist.map((item) => item.symbol) },
      orders: orders.items.map((order) => { const filled = order.fills.reduce((total, fill) => total.plus(fill.quantity), new Prisma.Decimal(0)); return { id: order.id, action: order.action, symbol: order.symbol, orderType: order.orderType, quantity: order.quantity.toString(), filledQuantity: filled.toString(), averagePrice: order.fills[0]?.price?.toString() ?? null, status: order.status, historyState: orderHistoryState(order.status), createdAt: order.createdAt.toISOString() }; }),
      adaptiveRiskAdjustments: adjustments.items.map((adjustment) => ({ id: adjustment.id, level: adjustment.level, reason: adjustment.reason, basePolicy: adjustment.basePolicy, effectivePolicy: adjustment.effectivePolicy, createdAt: adjustment.createdAt.toISOString() })),
      operatingCosts: operatingCosts.items.map((cost) => ({ id: cost.id, billingMonth: cost.billingMonth.toISOString(), monthlyCost: cost.monthlyCost.toString(), allocatedAmount: cost.allocatedAmount.toString(), chargedAmount: cost.chargedAmount.toString(), unpaidAmount: cost.unpaidAmount.toString(), capitalBefore: cost.capitalBefore.toString(), capitalAfter: cost.capitalAfter.toString(), createdAt: cost.createdAt.toISOString() })),
      page,
      hasMore: orders.hasMore || adjustments.hasMore || operatingCosts.hasMore
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 });
  }
}
