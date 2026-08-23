import { OrderStatus, Prisma, TradeAction } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { globalPaperBroker, GLOBAL_PAPER_WALLET_ID } from "@/modules/broker/global-paper";
import { applyBotFill, releaseBotReservation } from "@/modules/capital/fill-accounting";
import { proposeLearningFromLoss } from "@/modules/bots/learning-proposal-service";

type AlpacaOrderPayload = {
  symbol?: string; side?: string; type?: string; qty?: string; filled_qty?: string; filled_avg_price?: string | null; submitted_at?: string; filled_at?: string | null;
};

const terminalOrderStatuses = new Set(["filled", "canceled", "expired", "rejected"]);

function orderStatus(status: string): OrderStatus {
  if (status === "filled") return OrderStatus.FILLED;
  if (status === "partially_filled") return OrderStatus.PARTIALLY_FILLED;
  if (status === "canceled" || status === "expired") return OrderStatus.CANCELED;
  if (status === "rejected") return OrderStatus.REJECTED;
  if (status === "new" || status === "accepted") return OrderStatus.NEW;
  return OrderStatus.PENDING;
}

async function lockBotForAccounting(tx: Prisma.TransactionClient, botId: string) {
  await tx.$queryRaw`SELECT \`id\` FROM \`BotInstance\` WHERE \`id\` = ${botId} FOR UPDATE`;
  return tx.botInstance.findUniqueOrThrow({ where: { id: botId } });
}

/** Terminal accounting has a single conditional claimant across concurrent reconciliations. */
export async function reconcileBotOrder(tx: Prisma.TransactionClient, brokerOrder: { id: string; clientOrderId: string; status: string; raw: Record<string, unknown> }) {
  const raw = brokerOrder.raw as AlpacaOrderPayload;
  // Serialize all terminal accounting for an order before examining its
  // reservation flag. The conditional claim remains the second guard for
  // retries, while this lock avoids MySQL serializable deadlocks between two
  // simultaneous reconciliation cycles.
  await tx.$queryRaw`SELECT \`id\` FROM \`Order\` WHERE \`clientOrderId\` = ${brokerOrder.clientOrderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { clientOrderId: brokerOrder.clientOrderId }, include: { fills: true } });
  if (!order) return;

  const proposal = await tx.tradeProposal.findUnique({ where: { id: order.proposalId } });
  if (!proposal) return;
  if (!terminalOrderStatuses.has(brokerOrder.status)) {
    await tx.order.update({ where: { id: order.id }, data: { status: orderStatus(brokerOrder.status), rawPayload: brokerOrder.raw as Prisma.InputJsonValue } });
    return;
  }

  const claimed = await tx.order.updateMany({
    where: { id: order.id, reservationReleasedAt: null },
    data: { reservationReleasedAt: new Date() }
  });
  if (claimed.count !== 1) {
    await tx.order.update({ where: { id: order.id }, data: { status: orderStatus(brokerOrder.status), rawPayload: brokerOrder.raw as Prisma.InputJsonValue } });
    return;
  }

  const bot = await lockBotForAccounting(tx, proposal.botId);
  const filledQuantity = new Prisma.Decimal(raw.filled_qty ?? "0");
  const fillPrice = raw.filled_avg_price ?? proposal.estimatedPrice.toString();
  const alreadyRecorded = order.fills.reduce((total, fill) => total.plus(fill.quantity), new Prisma.Decimal(0));
  const delta = filledQuantity.minus(alreadyRecorded);
  const reservedForOrder = proposal.reservationAmount.toString();
  const currentPosition = await tx.botPosition.findUnique({ where: { botId_symbol: { botId: bot.id, symbol: proposal.symbol } } });
  const hasFill = filledQuantity.gt(0);
  let remainingPosition = currentPosition?.quantity ?? new Prisma.Decimal(0);
  const realizedPnl = proposal.action === TradeAction.SELL && delta.gt(0) && currentPosition
    ? delta.mul(new Prisma.Decimal(fillPrice).minus(currentPosition.averageEntryPrice))
    : new Prisma.Decimal(0);

  if (delta.gt(0)) {
    await tx.fill.create({
      data: {
        orderId: order.id,
        botId: bot.id,
        brokerFillId: `${brokerOrder.id}:${filledQuantity.toFixed(12)}`,
        quantity: delta,
        price: fillPrice,
        realizedPnl,
        filledAt: raw.filled_at ? new Date(raw.filled_at) : new Date()
      }
    });
  }

  if (hasFill && proposal.action === TradeAction.BUY) {
    const previousCost = currentPosition ? currentPosition.quantity.mul(currentPosition.averageEntryPrice) : new Prisma.Decimal(0);
    const nextQuantity = remainingPosition.plus(filledQuantity);
    const nextAverage = previousCost.plus(filledQuantity.mul(fillPrice)).div(nextQuantity);
    await tx.botPosition.upsert({
      where: { botId_symbol: { botId: bot.id, symbol: proposal.symbol } },
      create: { botId: bot.id, symbol: proposal.symbol, quantity: nextQuantity, averageEntryPrice: nextAverage },
      update: { quantity: nextQuantity, averageEntryPrice: nextAverage }
    });
    remainingPosition = nextQuantity;
  }

  if (hasFill && proposal.action === TradeAction.SELL) {
    const nextQuantity = Prisma.Decimal.max(new Prisma.Decimal(0), remainingPosition.minus(filledQuantity));
    if (nextQuantity.isZero()) await tx.botPosition.deleteMany({ where: { botId: bot.id, symbol: proposal.symbol } });
    else await tx.botPosition.update({ where: { botId_symbol: { botId: bot.id, symbol: proposal.symbol } }, data: { quantity: nextQuantity } });
    remainingPosition = nextQuantity;
  }

  const account = hasFill
    ? applyBotFill({
        action: proposal.action === TradeAction.BUY ? "BUY" : "SELL",
        currentCapital: bot.currentCapital.toString(),
        reservedCapital: bot.reservedCapital.toString(),
        fillQuantity: filledQuantity.toString(),
        fillPrice,
        reservedForOrder,
        remainingPositionQuantity: remainingPosition.toString()
      })
    : { ...releaseBotReservation({ currentCapital: bot.currentCapital.toString(), reservedCapital: bot.reservedCapital.toString(), reservedForOrder }), lifeStatus: bot.lifeStatus };

  const isDead = account.lifeStatus === "DEAD";
  await tx.botInstance.update({
    where: { id: bot.id },
    data: isDead
      ? { currentCapital: account.currentCapital, reservedCapital: account.reservedCapital, lifeStatus: "DEAD", diedAt: new Date(), runMode: "OFF", status: "PAUSED", killSwitch: true }
      : { currentCapital: account.currentCapital, reservedCapital: account.reservedCapital }
  });
  await tx.botCapitalEvent.create({
    data: {
      botId: bot.id,
      kind: hasFill ? `BROKER_${proposal.action}_FILL` : "ORDER_RESERVATION_RELEASED",
      amount: hasFill ? filledQuantity.mul(fillPrice) : new Prisma.Decimal(0),
      balanceAfter: account.currentCapital,
      metadata: { orderId: order.id, brokerOrderId: brokerOrder.id, brokerStatus: brokerOrder.status, symbol: proposal.symbol }
    }
  });
  if (isDead) {
    await tx.botStateTransition.create({ data: { botId: bot.id, fromState: bot.status, toState: "PAUSED", reason: "SURVIVAL_CAPITAL_EXHAUSTED" } });
    await tx.botModeTransition.create({ data: { botId: bot.id, fromMode: bot.runMode, toMode: "OFF", reason: "SURVIVAL_CAPITAL_EXHAUSTED" } });
  }
  await tx.order.update({ where: { id: order.id }, data: { status: orderStatus(brokerOrder.status), rawPayload: brokerOrder.raw as Prisma.InputJsonValue } });
  await tx.tradeProposal.update({ where: { id: proposal.id }, data: { status: brokerOrder.status === "filled" ? "FILLED" : brokerOrder.status === "rejected" ? "REJECTED" : "CANCELED" } });
  if (delta.gt(0) && proposal.action === TradeAction.SELL && realizedPnl.lt(0)) {
    await proposeLearningFromLoss({ botId: bot.id, botName: bot.name, walletId: bot.walletId, symbol: proposal.symbol }, tx);
  }
}

export async function syncGlobalPaperAccount() {
  const walletId = GLOBAL_PAPER_WALLET_ID;
  const adapter = globalPaperBroker();
  const [account, positions, orders, history] = await Promise.all([adapter.getAccount(), adapter.getPositions(), adapter.getOrders(), adapter.getPortfolioHistory()]);
  const snapshotPoints = [...history, { capturedAt: new Date(), equity: account.equity }];
  await prisma.$transaction(async (tx) => {
    await tx.position.deleteMany({ where: { walletId } });
    if (positions.length) await tx.position.createMany({ data: positions.map((position) => ({ walletId, symbol: position.symbol, quantity: position.quantity, averageEntryPrice: position.averageEntryPrice, marketValue: position.marketValue, unrealizedPnl: "0" })) });
    for (const point of snapshotPoints) {
      await tx.portfolioSnapshot.deleteMany({ where: { walletId, botId: null, capturedAt: point.capturedAt } });
      await tx.portfolioSnapshot.create({ data: { walletId, equity: point.equity, cash: account.cash, exposure: positions.reduce((sum, position) => sum.plus(position.marketValue), new Prisma.Decimal(0)), realizedPnl: "0", unrealizedPnl: "0", capturedAt: point.capturedAt } });
    }
    for (const order of orders) {
      const raw = order.raw as AlpacaOrderPayload;
      if (!raw.symbol || !raw.side || !raw.type || !raw.qty || !raw.submitted_at) continue;
      const internalOrder = order.clientOrderId ? await tx.order.findUnique({ where: { clientOrderId: order.clientOrderId } }) : null;
      const proposal = internalOrder ? await tx.tradeProposal.findUnique({ where: { id: internalOrder.proposalId }, include: { bot: { select: { walletId: true } } } }) : null;
      const attributedWalletId = proposal?.bot.walletId ?? walletId;
      await tx.brokerOrderSnapshot.upsert({
        where: { brokerOrderId: order.id },
        create: { walletId: attributedWalletId, brokerOrderId: order.id, clientOrderId: order.clientOrderId || null, symbol: raw.symbol, side: raw.side, orderType: raw.type, status: order.status, quantity: raw.qty, filledQuantity: raw.filled_qty ?? "0", filledAveragePrice: raw.filled_avg_price ?? null, submittedAt: new Date(raw.submitted_at), rawPayload: order.raw as Prisma.InputJsonValue },
        update: { walletId: attributedWalletId, status: order.status, filledQuantity: raw.filled_qty ?? "0", filledAveragePrice: raw.filled_avg_price ?? null, rawPayload: order.raw as Prisma.InputJsonValue }
      });
      await reconcileBotOrder(tx, order);
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { walletId, equity: account.equity, cash: account.cash, buyingPower: account.buyingPower, positions: positions.length, orders: orders.length, synchronizedAt: new Date() };
}

export async function ensureGlobalPaperWallet() {
  const config = env();
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: config.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() } });
  return prisma.$transaction(async (tx) => {
    const existing = await tx.wallet.findUnique({ where: { id: GLOBAL_PAPER_WALLET_ID } });
    if (existing) {
      await tx.wallet.update({ where: { id: existing.id }, data: { name: "Alpaca Paper - Main" } });
      await tx.paperCapitalPool.upsert({ where: { scope: "global" }, create: { scope: "global", managedCapital: existing.managedCapital, unallocatedCapital: new Prisma.Decimal(0) }, update: {} });
      return existing;
    }
    const mainCapital = new Prisma.Decimal(100);
    await tx.paperCapitalPool.upsert({ where: { scope: "global" }, create: { scope: "global", managedCapital: mainCapital, unallocatedCapital: mainCapital }, update: {} });
    const reserved = await tx.paperCapitalPool.updateMany({ where: { scope: "global", unallocatedCapital: { gte: mainCapital } }, data: { unallocatedCapital: { decrement: mainCapital } } });
    if (reserved.count !== 1) throw new Error("INSUFFICIENT_PAPER_CAPITAL_FOR_MAIN_WALLET");
    return tx.wallet.create({ data: { id: GLOBAL_PAPER_WALLET_ID, name: "Alpaca Paper - Main", managedCapital: mainCapital, unallocatedCapital: mainCapital, members: { create: { userId: admin.id, role: "ADMIN" } } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** @deprecated Personal mode synchronizes the one global Paper account. */
export const syncPaperWallet = async (_walletId: string) => syncGlobalPaperAccount();
