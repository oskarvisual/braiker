import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { ActivityFeed } from "@/components/activity-feed";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/modules/auth/session";
import { orderHistoryState } from "@/modules/history/order-history";

export default async function ActivityPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const wallet = await prisma.wallet.findFirst({ where: user.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } }, include: { bots: { select: { id: true, name: true } } } });
  if (!wallet) redirect("/");
  const proposals = await prisma.tradeProposal.findMany({ where: { bot: { walletId: wallet.id } }, select: { id: true, bot: { select: { id: true, name: true } } } });
  const proposalById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const proposalIds = proposals.map((proposal) => proposal.id);
  const [orders, brokerOrders] = await Promise.all([
    prisma.order.findMany({ where: { proposalId: { in: proposalIds } }, include: { fills: { select: { quantity: true, price: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.brokerOrderSnapshot.findMany({ where: { walletId: wallet.id }, orderBy: { submittedAt: "desc" }, take: 100 })
  ]);
  const internalBrokerOrderIds = new Set(orders.flatMap((order) => order.brokerOrderId ? [order.brokerOrderId] : []));
  const internalClientOrderIds = new Set(orders.map((order) => order.clientOrderId));
  const historyOrders = [
    ...orders.map((order) => {
      const proposal = proposalById.get(order.proposalId);
      const fills = order.fills.reduce((total, fill) => total.plus(fill.quantity), new Prisma.Decimal(0));
      const averagePrice = order.fills[0]?.price?.toString() ?? null;
      return { id: `braiker-${order.id}`, proposalId: order.proposalId, botId: proposal?.bot.id ?? null, botName: proposal?.bot.name ?? null, symbol: order.symbol, side: order.action, orderType: order.orderType, quantity: order.quantity.toString(), filledQuantity: fills.toString(), averagePrice, brokerStatus: order.status, historyState: orderHistoryState(order.status), submittedAt: order.createdAt.toISOString(), source: "BRAIKER" as const };
    }),
    ...brokerOrders.filter((order) => !internalBrokerOrderIds.has(order.brokerOrderId) && (!order.clientOrderId || !internalClientOrderIds.has(order.clientOrderId))).map((order) => ({ id: `alpaca-${order.id}`, proposalId: null, botId: null, botName: null, symbol: order.symbol, side: order.side, orderType: order.orderType, quantity: order.quantity.toString(), filledQuantity: order.filledQuantity.toString(), averagePrice: order.filledAveragePrice?.toString() ?? null, brokerStatus: order.status, historyState: orderHistoryState(order.status), submittedAt: order.submittedAt.toISOString(), source: "ALPACA" as const }))
  ].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><ActivityFeed orders={historyOrders} bots={wallet.bots} /></main></>;
}
