import { randomUUID } from "node:crypto";
import { JobStatus, OrderStatus, Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { globalPaperBroker } from "@/modules/broker/global-paper";
import type { ApprovedOrder, BrokerAdapter } from "@/modules/domain/contracts";
import { canSubmitWithKillSwitch } from "@/modules/execution/kill-switch-gate";

const LEASE_MS = 60_000;

type ExecutionBroker = Pick<BrokerAdapter, "getOrderByClientOrderId" | "placeOrder">;

function mapOrderStatus(status: string): OrderStatus {
  if (status === "filled") return OrderStatus.FILLED;
  if (status === "partially_filled") return OrderStatus.PARTIALLY_FILLED;
  if (status === "canceled") return OrderStatus.CANCELED;
  if (status === "rejected") return OrderStatus.REJECTED;
  if (status === "new" || status === "accepted") return OrderStatus.NEW;
  return OrderStatus.PENDING;
}

/**
 * The bot row lock is held until the idempotent broker submit/recovery call has
 * completed. Bot controls acquire the same lock, so Kill Switch persistence is
 * ordered against the irreversible broker action rather than a stale read.
 */
export async function processOneExecutionJob(dependencies: { db?: PrismaClient; broker?: ExecutionBroker } = {}) {
  const db = dependencies.db ?? prisma;
  const candidate = await db.executionJob.findFirst({ where: { status: JobStatus.PENDING }, orderBy: { createdAt: "asc" } });
  if (!candidate) return false;
  const leaseToken = randomUUID();
  const claimed = await db.executionJob.updateMany({ where: { id: candidate.id, status: JobStatus.PENDING }, data: { status: JobStatus.RUNNING, leaseToken, leaseExpiresAt: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } } });
  if (claimed.count !== 1) return false;

  try {
    const result = await db.$transaction(async (tx) => {
      const job = await tx.executionJob.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { proposal: { include: { riskDecision: true } } }
      });
      if (job.status !== JobStatus.RUNNING || job.leaseToken !== leaseToken) throw new Error("EXECUTION_LEASE_LOST");
      const { proposal } = job;
      await tx.$queryRaw`SELECT \`id\` FROM \`BotInstance\` WHERE \`id\` = ${proposal.botId} FOR UPDATE`;
      const bot = await tx.botInstance.findUniqueOrThrow({ where: { id: proposal.botId } });
      const gate = canSubmitWithKillSwitch({ killSwitch: bot.killSwitch, status: bot.status, riskApproved: proposal.riskDecision?.approved === true });
      if (!gate.allowed) throw new Error(gate.reason);

      const clientOrderId = `brk_${proposal.id.replaceAll("-", "")}`;
      const adapter = dependencies.broker ?? globalPaperBroker();
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

      await tx.order.upsert({
        where: { clientOrderId },
        create: { proposalId: proposal.id, brokerOrderId: brokerOrder.id, clientOrderId, symbol: proposal.symbol, action: proposal.action, orderType: proposal.orderType, quantity: proposal.quantity, limitPrice: proposal.limitPrice, status: mapOrderStatus(brokerOrder.status), rawPayload: brokerOrder.raw as Prisma.InputJsonValue },
        update: { brokerOrderId: brokerOrder.id, status: mapOrderStatus(brokerOrder.status), rawPayload: brokerOrder.raw as Prisma.InputJsonValue }
      });
      await tx.tradeProposal.update({ where: { id: proposal.id }, data: { status: "SUBMITTED" } });
      const completed = await tx.executionJob.updateMany({ where: { id: job.id, leaseToken }, data: { status: JobStatus.COMPLETED, leaseExpiresAt: null } });
      if (completed.count !== 1) throw new Error("EXECUTION_LEASE_LOST");
      return { jobId: job.id, proposalId: proposal.id, clientOrderId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    logger.info(result, "Paper order submitted or recovered");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await db.executionJob.updateMany({ where: { id: candidate.id, leaseToken }, data: { status: JobStatus.FAILED, lastError: message, leaseExpiresAt: null } });
    logger.error({ err: error, jobId: candidate.id }, "Paper execution job failed");
  }
  return true;
}
