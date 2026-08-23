import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GLOBAL_PAPER_WALLET_ID } from "@/modules/broker/global-paper";
import { botCapitalBreakdown, positiveEquitySnapshots } from "@/modules/dashboard/dashboard-metrics";

const value = (input: { toString(): string }) => input.toString();

export async function getDashboardData(user: Pick<User, "id" | "role">) {
  const walletWhere = user.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } };
  const wallets = await prisma.wallet.findMany({ where: walletWhere, orderBy: { createdAt: "asc" } });
  if (!wallets.length) return null;
  const walletIds = wallets.map((wallet) => wallet.id);
  // The single Paper broker account is represented by the global wallet. An
  // Admin sees that true broker portfolio while fleet/capital totals span all
  // virtual wallets; a scoped member retains the previous wallet boundary.
  const brokerWalletId = user.role === "ADMIN" ? GLOBAL_PAPER_WALLET_ID : wallets[0].id;
  const [latestSnapshot, snapshots, positions, orders, bots] = await Promise.all([
    prisma.portfolioSnapshot.findFirst({ where: { walletId: brokerWalletId, botId: null, equity: { gt: 0 } }, orderBy: { capturedAt: "desc" } }),
    prisma.portfolioSnapshot.findMany({ where: { walletId: brokerWalletId, botId: null, equity: { gt: 0 }, capturedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { capturedAt: "asc" } }),
    prisma.position.findMany({ where: { walletId: brokerWalletId }, orderBy: { marketValue: "desc" } }),
    prisma.brokerOrderSnapshot.findMany({ where: { walletId: brokerWalletId }, orderBy: { submittedAt: "desc" }, take: 8 }),
    prisma.botInstance.findMany({ where: { walletId: { in: walletIds } }, include: { watchlist: { where: { enabled: true }, orderBy: { symbol: "asc" } } }, orderBy: { createdAt: "asc" } })
  ]);
  const validSnapshots = positiveEquitySnapshots(snapshots.map((snapshot) => ({ capturedAt: snapshot.capturedAt.toISOString(), equity: value(snapshot.equity) })));
  const firstEquity = validSnapshots[0]?.equity ?? latestSnapshot?.equity.toString() ?? null;
  const lastEquity = latestSnapshot?.equity.toString() ?? validSnapshots.at(-1)?.equity ?? null;
  const capital = botCapitalBreakdown({ wallets: wallets.map((wallet) => ({ managedCapital: value(wallet.managedCapital), unallocatedCapital: value(wallet.unallocatedCapital) })), botCapitals: bots.map((bot) => value(bot.currentCapital)) });
  return {
    wallet: { id: brokerWalletId, name: user.role === "ADMIN" ? "All virtual wallets" : wallets[0].name, walletCount: wallets.length, managedCapital: capital.managedCapital, unallocatedCapital: capital.unallocatedCapital, allocatedCapital: capital.currentBotCapital },
    account: latestSnapshot ? { equity: value(latestSnapshot.equity), cash: value(latestSnapshot.cash), exposure: value(latestSnapshot.exposure), capturedAt: latestSnapshot.capturedAt.toISOString(), sevenDayPnl: firstEquity && lastEquity ? new Prisma.Decimal(lastEquity).minus(firstEquity).toString() : null } : null,
    chart: validSnapshots,
    positions: positions.map((position) => ({ symbol: position.symbol, quantity: value(position.quantity), marketValue: value(position.marketValue), averageEntryPrice: value(position.averageEntryPrice), unrealizedPnl: value(position.unrealizedPnl) })),
    orders: orders.map((order) => ({ id: order.id, symbol: order.symbol, side: order.side, orderType: order.orderType, status: order.status, quantity: value(order.quantity), filledQuantity: value(order.filledQuantity), filledAveragePrice: order.filledAveragePrice?.toString() ?? null, submittedAt: order.submittedAt.toISOString() })),
    bots: bots.map((bot) => ({ id: bot.id, name: bot.name, templateId: bot.templateId, avatarSeed: bot.avatarSeed, runMode: bot.runMode, lifeStatus: bot.lifeStatus, currentCapital: value(bot.currentCapital), initialCapital: value(bot.initialCapital), symbols: bot.watchlist.map((item) => item.symbol) }))
  };
}
