import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { botCapitalBreakdown } from "@/modules/dashboard/dashboard-metrics";

const value = (input: { toString(): string }) => input.toString();

export async function getDashboardData(user: Pick<User, "id" | "role">) {
  const walletWhere = user.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } };
  const wallet = await prisma.wallet.findFirst({ where: walletWhere, orderBy: { createdAt: "asc" } });
  if (!wallet) return null;
  const [latestSnapshot, snapshots, positions, orders, bots] = await Promise.all([
    prisma.portfolioSnapshot.findFirst({ where: { walletId: wallet.id, botId: null }, orderBy: { capturedAt: "desc" } }),
    prisma.portfolioSnapshot.findMany({ where: { walletId: wallet.id, botId: null, capturedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { capturedAt: "asc" } }),
    prisma.position.findMany({ where: { walletId: wallet.id }, orderBy: { marketValue: "desc" } }),
    prisma.brokerOrderSnapshot.findMany({ where: { walletId: wallet.id }, orderBy: { submittedAt: "desc" }, take: 8 }),
    prisma.botInstance.findMany({ where: { walletId: wallet.id }, include: { watchlist: { where: { enabled: true }, orderBy: { symbol: "asc" } } }, orderBy: { createdAt: "asc" } })
  ]);
  const firstEquity = snapshots[0]?.equity ?? latestSnapshot?.equity ?? null;
  const lastEquity = latestSnapshot?.equity ?? snapshots.at(-1)?.equity ?? null;
  const capital = botCapitalBreakdown(value(wallet.managedCapital), value(wallet.unallocatedCapital));
  return {
    wallet: { id: wallet.id, name: wallet.name, managedCapital: value(wallet.managedCapital), unallocatedCapital: value(wallet.unallocatedCapital), allocatedCapital: capital.allocated },
    account: latestSnapshot ? { equity: value(latestSnapshot.equity), cash: value(latestSnapshot.cash), exposure: value(latestSnapshot.exposure), capturedAt: latestSnapshot.capturedAt.toISOString(), sevenDayPnl: firstEquity && lastEquity ? lastEquity.minus(firstEquity).toString() : null } : null,
    chart: snapshots.map((snapshot) => ({ capturedAt: snapshot.capturedAt.toISOString(), equity: value(snapshot.equity) })),
    positions: positions.map((position) => ({ symbol: position.symbol, quantity: value(position.quantity), marketValue: value(position.marketValue), averageEntryPrice: value(position.averageEntryPrice), unrealizedPnl: value(position.unrealizedPnl) })),
    orders: orders.map((order) => ({ id: order.id, symbol: order.symbol, side: order.side, orderType: order.orderType, status: order.status, quantity: value(order.quantity), filledQuantity: value(order.filledQuantity), filledAveragePrice: order.filledAveragePrice?.toString() ?? null, submittedAt: order.submittedAt.toISOString() })),
    bots: bots.map((bot) => ({ id: bot.id, name: bot.name, templateId: bot.templateId, avatarSeed: bot.avatarSeed, runMode: bot.runMode, lifeStatus: bot.lifeStatus, currentCapital: value(bot.currentCapital), initialCapital: value(bot.initialCapital), symbols: bot.watchlist.map((item) => item.symbol) }))
  };
}
