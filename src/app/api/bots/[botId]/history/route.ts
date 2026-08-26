import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { orderHistoryState } from "@/modules/history/order-history";
import { pageResult, pageWindow } from "@/modules/pagination/page";
import { GLOBAL_PAPER_WALLET_ID } from "@/modules/broker/global-paper";
import { valueBotAssets, valueBotPositionRows } from "@/modules/bots/bot-asset-valuation";
import { calculateBotPerformance } from "@/modules/bots/bot-performance";

export async function GET(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    const user = await requireUser();
    const { botId } = await context.params;
    const bot = await prisma.botInstance.findUnique({ where: { id: botId }, include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } }, watchlist: { where: { enabled: true }, select: { symbol: true } }, botPositions: { where: { quantity: { gt: 0 } }, select: { id: true, symbol: true, quantity: true, averageEntryPrice: true } } } });
    if (!bot || (user.role !== "ADMIN" && bot.wallet.members.length === 0)) return NextResponse.json({ error: "BOT_NOT_FOUND" }, { status: 404 });
    const { page, skip, take } = pageWindow(new URL(request.url).searchParams.get("page"));
    const [proposals, adjustmentRows, costRows, globalPositions, capitalEvents, fillTotals, performanceSnapshots] = await Promise.all([
      prisma.tradeProposal.findMany({ where: { botId }, select: { id: true } }),
      prisma.botRiskAdjustment.findMany({ where: { botId }, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.operatingCostAllocation.findMany({ where: { botId }, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.position.findMany({ where: { walletId: GLOBAL_PAPER_WALLET_ID }, select: { symbol: true, quantity: true, marketValue: true, updatedAt: true } }),
      prisma.botCapitalEvent.findMany({ where: { botId }, orderBy: { createdAt: "asc" }, select: { kind: true, amount: true } }),
      prisma.fill.aggregate({ where: { botId }, _sum: { realizedPnl: true } }),
      prisma.botPerformanceSnapshot.findMany({ where: { botId }, orderBy: { marketDate: "desc" }, take: 90, select: { marketDate: true, liquidCapital: true, assetValue: true, equity: true, capturedAt: true } })
    ]);
    const orderRows = await prisma.order.findMany({ where: { proposalId: { in: proposals.map((proposal) => proposal.id) } }, include: { fills: { select: { quantity: true, price: true } } }, orderBy: { createdAt: "desc" }, skip, take });
    const orders = pageResult(orderRows);
    const adjustments = pageResult(adjustmentRows);
    const operatingCosts = pageResult(costRows);
    const positionInputs = bot.botPositions.map((position) => ({ botId, symbol: position.symbol, quantity: position.quantity.toString(), averageEntryPrice: position.averageEntryPrice.toString() }));
    const globalPositionInputs = globalPositions.map((position) => ({ symbol: position.symbol, quantity: position.quantity.toString(), marketValue: position.marketValue.toString(), updatedAt: position.updatedAt.toISOString() }));
    const assets = valueBotAssets({ positions: positionInputs, globalPositions: globalPositionInputs }).byBot[botId] ?? { value: "0", valuedAt: null, unpricedSymbols: [] };
    const assetPositions = valueBotPositionRows({ positions: positionInputs.map(({ botId: _botId, ...position }) => position), globalPositions: globalPositionInputs });
    const performance = calculateBotPerformance({
      initialCapital: bot.initialCapital.toString(),
      currentCapital: bot.currentCapital.toString(),
      assetValue: assets.value,
      positions: bot.botPositions.map((position) => ({ quantity: position.quantity.toString(), averageEntryPrice: position.averageEntryPrice.toString() })),
      capitalEvents: capitalEvents.map((event) => ({ kind: event.kind, amount: event.amount.toString() })),
      realizedPnl: fillTotals._sum.realizedPnl?.toString() ?? "0",
      operatingCosts: capitalEvents.filter((event) => event.kind === "OPERATING_COST").reduce((total, event) => total.plus(new Prisma.Decimal(event.amount).abs()), new Prisma.Decimal(0)).toString()
    });
    return NextResponse.json({
      bot: { id: bot.id, name: bot.name, templateId: bot.templateId, avatarSeed: bot.avatarSeed, lifeStatus: bot.lifeStatus, runMode: bot.runMode, status: bot.status, killSwitch: bot.killSwitch, adaptiveRiskEnabled: bot.adaptiveRiskEnabled, currentCapital: bot.currentCapital.toString(), initialCapital: bot.initialCapital.toString(), reservedCapital: bot.reservedCapital.toString(), openPositionCount: bot.botPositions.length, symbols: bot.watchlist.map((item) => item.symbol), assets, assetPositions },
      performance,
      performanceHistory: performanceSnapshots.reverse().map((snapshot) => ({ marketDate: snapshot.marketDate.toISOString(), liquidCapital: snapshot.liquidCapital.toString(), assets: snapshot.assetValue.toString(), equity: snapshot.equity.toString(), capturedAt: snapshot.capturedAt.toISOString() })),
      orders: orders.items.map((order) => { const filled = order.fills.reduce((total, fill) => total.plus(fill.quantity), new Prisma.Decimal(0)); return { id: order.id, action: order.action, symbol: order.symbol, orderType: order.orderType, quantity: order.quantity.toString(), filledQuantity: filled.toString(), averagePrice: order.fills[0]?.price?.toString() ?? null, status: order.status, historyState: orderHistoryState(order.status), createdAt: order.createdAt.toISOString() }; }),
      adaptiveRiskAdjustments: adjustments.items.map((adjustment) => ({ id: adjustment.id, level: adjustment.level, reason: adjustment.reason, basePolicy: adjustment.basePolicy, effectivePolicy: adjustment.effectivePolicy, createdAt: adjustment.createdAt.toISOString() })),
      operatingCosts: operatingCosts.items.map((cost) => ({ id: cost.id, billingMonth: cost.billingMonth.toISOString(), monthlyCost: cost.monthlyCost.toString(), allocatedAmount: cost.allocatedAmount.toString(), chargedAmount: cost.chargedAmount.toString(), unpaidAmount: cost.unpaidAmount.toString(), capitalBefore: cost.capitalBefore.toString(), capitalAfter: cost.capitalAfter.toString(), createdAt: cost.createdAt.toISOString() })),
      page,
      hasMore: { orders: orders.hasMore, adjustments: adjustments.hasMore, operatingCosts: operatingCosts.hasMore }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 });
  }
}
