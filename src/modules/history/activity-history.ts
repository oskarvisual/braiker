import { Prisma, type PrismaClient, type UserRole } from "@prisma/client";
import { orderHistoryState, type OrderHistoryState } from "./order-history";

type ActivityHistoryDb = Pick<PrismaClient, "wallet" | "tradeProposal" | "order" | "brokerOrderSnapshot">;

export type ActivityHistoryOrder = {
  id: string;
  proposalId: string | null;
  walletId: string | null;
  botId: string | null;
  botName: string | null;
  symbol: string;
  side: string;
  orderType: string;
  quantity: string;
  filledQuantity: string;
  averagePrice: string | null;
  brokerStatus: string;
  historyState: OrderHistoryState;
  submittedAt: string;
  source: "BRAIKER" | "ALPACA";
};

/** All accessible wallets contribute to the unified History view. */
export async function listActivityHistory(input: { userId: string; role: UserRole }, db: ActivityHistoryDb): Promise<{ hasWallets: boolean; wallets: Array<{ id: string; name: string }>; bots: Array<{ id: string; name: string; walletId: string }>; orders: ActivityHistoryOrder[] }> {
  const wallets = await db.wallet.findMany({
    where: input.role === "ADMIN" ? {} : { members: { some: { userId: input.userId } } },
    select: { id: true, name: true, bots: { select: { id: true, name: true } } }
  });
  const walletIds = wallets.map((wallet) => wallet.id);
  if (!walletIds.length) return { hasWallets: false, wallets: [], bots: [], orders: [] };

  const proposals = await db.tradeProposal.findMany({
    where: { bot: { walletId: { in: walletIds } } },
    select: { id: true, bot: { select: { id: true, name: true, walletId: true } } }
  });
  const proposalById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const proposalIds = proposals.map((proposal) => proposal.id);
  const [orders, brokerOrders] = await Promise.all([
    prismaOrdersForProposals(proposalIds, db),
    db.brokerOrderSnapshot.findMany({ where: { walletId: { in: walletIds } }, orderBy: { submittedAt: "desc" }, take: 100 })
  ]);
  const internalBrokerOrderIds = new Set(orders.flatMap((order) => order.brokerOrderId ? [order.brokerOrderId] : []));
  const internalClientOrderIds = new Set(orders.map((order) => order.clientOrderId));
  const historyOrders: ActivityHistoryOrder[] = [
    ...orders.map((order) => {
      const proposal = proposalById.get(order.proposalId);
      const fills = order.fills.reduce((total, fill) => total.plus(fill.quantity), new Prisma.Decimal(0));
      return {
        id: `braiker-${order.id}`,
        proposalId: order.proposalId,
        walletId: proposal?.bot.walletId ?? null,
        botId: proposal?.bot.id ?? null,
        botName: proposal?.bot.name ?? null,
        symbol: order.symbol,
        side: order.action,
        orderType: order.orderType,
        quantity: order.quantity.toString(),
        filledQuantity: fills.toString(),
        averagePrice: order.fills[0]?.price?.toString() ?? null,
        brokerStatus: order.status,
        historyState: orderHistoryState(order.status),
        submittedAt: order.createdAt.toISOString(),
        source: "BRAIKER" as const
      };
    }),
    ...brokerOrders
      .filter((order) => !internalBrokerOrderIds.has(order.brokerOrderId) && (!order.clientOrderId || !internalClientOrderIds.has(order.clientOrderId)))
      .map((order) => ({
        id: `alpaca-${order.id}`,
        proposalId: null,
        walletId: order.walletId,
        botId: null,
        botName: null,
        symbol: order.symbol,
        side: order.side,
        orderType: order.orderType,
        quantity: order.quantity.toString(),
        filledQuantity: order.filledQuantity.toString(),
        averagePrice: order.filledAveragePrice?.toString() ?? null,
        brokerStatus: order.status,
        historyState: orderHistoryState(order.status),
        submittedAt: order.submittedAt.toISOString(),
        source: "ALPACA" as const
      }))
  ].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));

  return { hasWallets: true, wallets: wallets.map(({ id, name }) => ({ id, name })), bots: wallets.flatMap((wallet) => wallet.bots.map((bot) => ({ ...bot, walletId: wallet.id }))), orders: historyOrders };
}

function prismaOrdersForProposals(proposalIds: string[], db: ActivityHistoryDb) {
  if (!proposalIds.length) return Promise.resolve([]);
  return db.order.findMany({
    where: { proposalId: { in: proposalIds } },
    include: { fills: { select: { quantity: true, price: true } } },
    orderBy: { createdAt: "desc" },
    take: 100
  });
}
