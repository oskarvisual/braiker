import { randomUUID } from "node:crypto";
import { JobStatus, OrderStatus, Prisma } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { AlpacaPaperBrokerAdapter } from "@/modules/broker/alpaca-paper";
import type { ApprovedOrder } from "@/modules/domain/contracts";

const LEASE_MS = 60_000;

function mapOrderStatus(status: string): OrderStatus {
  if (status === "filled") return OrderStatus.FILLED;
  if (status === "partially_filled") return OrderStatus.PARTIALLY_FILLED;
  if (status === "canceled") return OrderStatus.CANCELED;
  if (status === "rejected") return OrderStatus.REJECTED;
  if (status === "new" || status === "accepted") return OrderStatus.NEW;
  return OrderStatus.PENDING;
}

export async function processOneExecutionJob() {
  const candidate = await prisma.executionJob.findFirst({ where: { status: JobStatus.PENDING }, orderBy: { createdAt: "asc" } });
  if (!candidate) return false;
  const leaseToken = randomUUID();
  const claimed = await prisma.executionJob.updateMany({ where: { id: candidate.id, status: JobStatus.PENDING }, data: { status: JobStatus.RUNNING, leaseToken, leaseExpiresAt: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } } });
  if (claimed.count !== 1) return false;

  try {
    const job = await prisma.executionJob.findUniqueOrThrow({
      where: { id: candidate.id },
      include: { proposal: { include: { bot: { include: { wallet: { include: { connections: true } } } }, riskDecision: true } } }
    });
    const { proposal } = job;
    const { bot } = proposal;
    if (bot.killSwitch || bot.status !== "RUNNING") throw new Error(bot.killSwitch ? "KILL_SWITCH" : "BOT_NOT_RUNNING");
    if (!proposal.riskDecision?.approved) throw new Error("RISK_NOT_APPROVED");
    const connection = bot.wallet.connections.find((item) => item.provider === "alpaca" && item.mode === "PAPER");
    if (!connection) throw new Error("PAPER_BROKER_CONNECTION_NOT_FOUND");

    const adapter = new AlpacaPaperBrokerAdapter({
      apiKey: decryptSecret({ ciphertext: connection.encryptedKey, iv: connection.keyIv, tag: connection.keyTag, keyVersion: connection.keyVersion }),
      apiSecret: decryptSecret({ ciphertext: connection.encryptedSecret, iv: connection.secretIv, tag: connection.secretTag, keyVersion: connection.keyVersion })
    });
    const clientOrderId = `brk_${proposal.id.replaceAll("-", "")}`;
    const existing = await adapter.getOrderByClientOrderId(clientOrderId);
    const brokerOrder = existing ?? await adapter.placeOrder({
      symbol: proposal.symbol,
      action: proposal.action === "BUY" ? "BUY" : "SELL",
      orderType: proposal.orderType === "MARKET" ? "MARKET" : "LIMIT",
      quantity: proposal.quantity.toString(),
      limitPrice: proposal.limitPrice?.toString(),
      estimatedPrice: proposal.estimatedPrice.toString(),
      clientOrderId
    } satisfies ApprovedOrder);

    await prisma.$transaction([
      prisma.order.upsert({
        where: { clientOrderId },
        create: { proposalId: proposal.id, brokerOrderId: brokerOrder.id, clientOrderId, symbol: proposal.symbol, action: proposal.action, orderType: proposal.orderType, quantity: proposal.quantity, limitPrice: proposal.limitPrice, status: mapOrderStatus(brokerOrder.status), rawPayload: brokerOrder.raw as Prisma.InputJsonValue },
        update: { brokerOrderId: brokerOrder.id, status: mapOrderStatus(brokerOrder.status), rawPayload: brokerOrder.raw as Prisma.InputJsonValue }
      }),
      prisma.tradeProposal.update({ where: { id: proposal.id }, data: { status: "SUBMITTED" } }),
      prisma.executionJob.updateMany({ where: { id: job.id, leaseToken }, data: { status: JobStatus.COMPLETED, leaseExpiresAt: null } })
    ]);
    logger.info({ jobId: job.id, proposalId: proposal.id, clientOrderId }, "Paper order submitted or recovered");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await prisma.executionJob.updateMany({ where: { id: candidate.id, leaseToken }, data: { status: JobStatus.FAILED, lastError: message, leaseExpiresAt: null } });
    logger.error({ err: error, jobId: candidate.id }, "Paper execution job failed");
  }
  return true;
}
