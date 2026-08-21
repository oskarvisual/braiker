import { Prisma } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { AlpacaPaperBrokerAdapter } from "@/modules/broker/alpaca-paper";

type AlpacaOrderPayload = {
  symbol?: string; side?: string; type?: string; qty?: string; filled_qty?: string; filled_avg_price?: string | null; submitted_at?: string;
};

function adapterForConnection(connection: { encryptedKey: string; keyIv: string; keyTag: string; encryptedSecret: string; secretIv: string; secretTag: string; keyVersion: number }) {
  return new AlpacaPaperBrokerAdapter({
    apiKey: decryptSecret({ ciphertext: connection.encryptedKey, iv: connection.keyIv, tag: connection.keyTag, keyVersion: connection.keyVersion }),
    apiSecret: decryptSecret({ ciphertext: connection.encryptedSecret, iv: connection.secretIv, tag: connection.secretTag, keyVersion: connection.keyVersion })
  });
}

export async function syncPaperWallet(walletId: string) {
  const connection = await prisma.brokerConnection.findUniqueOrThrow({ where: { walletId_provider_mode: { walletId, provider: "alpaca", mode: "PAPER" } } });
  const adapter = adapterForConnection(connection);
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
      await tx.brokerOrderSnapshot.upsert({
        where: { brokerOrderId: order.id },
        create: { walletId, brokerOrderId: order.id, clientOrderId: order.clientOrderId || null, symbol: raw.symbol, side: raw.side, orderType: raw.type, status: order.status, quantity: raw.qty, filledQuantity: raw.filled_qty ?? "0", filledAveragePrice: raw.filled_avg_price ?? null, submittedAt: new Date(raw.submitted_at), rawPayload: order.raw as Prisma.InputJsonValue },
        update: { status: order.status, filledQuantity: raw.filled_qty ?? "0", filledAveragePrice: raw.filled_avg_price ?? null, rawPayload: order.raw as Prisma.InputJsonValue }
      });
    }
  });
  return { walletId, equity: account.equity, cash: account.cash, buyingPower: account.buyingPower, positions: positions.length, orders: orders.length, synchronizedAt: new Date() };
}

export async function bootstrapDefaultPaperWallet() {
  const config = env();
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: config.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() } });
  const wallet = await prisma.wallet.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: { id: "00000000-0000-4000-8000-000000000001", name: "Alpaca Paper - Main", managedCapital: "100", unallocatedCapital: "100", members: { create: { userId: admin.id, role: "ADMIN" } } },
    update: { name: "Alpaca Paper - Main" }
  });
  const key = encryptSecret(config.ALPACA_API_KEY);
  const secret = encryptSecret(config.ALPACA_API_SECRET);
  await prisma.brokerConnection.upsert({
    where: { walletId_provider_mode: { walletId: wallet.id, provider: "alpaca", mode: "PAPER" } },
    create: { walletId: wallet.id, provider: "alpaca", mode: "PAPER", encryptedKey: key.ciphertext, keyIv: key.iv, keyTag: key.tag, encryptedSecret: secret.ciphertext, secretIv: secret.iv, secretTag: secret.tag, keyVersion: 1 },
    update: { encryptedKey: key.ciphertext, keyIv: key.iv, keyTag: key.tag, encryptedSecret: secret.ciphertext, secretIv: secret.iv, secretTag: secret.tag, keyVersion: 1 }
  });
  return syncPaperWallet(wallet.id);
}
