import { OrderType, Prisma, TradeAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assessRisk } from "@/modules/risk/risk-engine";
import type { RiskContext, RiskPolicy } from "@/modules/risk/types";
import type { TradeProposalInput } from "@/modules/domain/contracts";
import { riskRejections } from "@/modules/monitoring/metrics";
import { shouldQueuePaperExecution } from "@/modules/bots/bot-templates";

export async function recordProposedTrade(input: {
  botId: string;
  signalId?: string;
  aiDecisionId?: string;
  proposal: TradeProposalInput;
  marketContext: Record<string, unknown>;
  riskContext: RiskContext;
  policy: RiskPolicy;
}) {
  return prisma.$transaction(async (tx) => {
    const bot = await tx.botInstance.findUniqueOrThrow({ where: { id: input.botId }, select: { runMode: true, lifeStatus: true, currentCapital: true, reservedCapital: true } });
    if (bot.lifeStatus === "DEAD") throw new Error("BOT_DEAD");
    const botCapitalAvailable = bot.currentCapital.minus(bot.reservedCapital).toString();
    const decision = assessRisk(input.proposal, { ...input.riskContext, botCapitalAvailable }, input.policy);
    const proposal = await tx.tradeProposal.create({
      data: {
        botId: input.botId,
        signalId: input.signalId,
        aiDecisionId: input.aiDecisionId,
        symbol: input.proposal.symbol,
        action: input.proposal.action === "BUY" ? TradeAction.BUY : TradeAction.SELL,
        orderType: input.proposal.orderType === "MARKET" ? OrderType.MARKET : OrderType.LIMIT,
        quantity: input.proposal.quantity,
        limitPrice: input.proposal.limitPrice,
        estimatedPrice: input.proposal.estimatedPrice,
        status: decision.approved ? "RISK_APPROVED" : "RISK_REJECTED",
        context: input.marketContext as Prisma.InputJsonValue
      }
    });
    await tx.riskDecision.create({ data: { proposalId: proposal.id, approved: decision.approved, reason: decision.reason, checks: decision.checks as Prisma.InputJsonValue, approvedOrder: decision.approvedOrder as Prisma.InputJsonValue | undefined } });
    if (shouldQueuePaperExecution(bot.runMode, decision.approved)) {
      if (input.proposal.action === "BUY") {
        const price = new Prisma.Decimal(input.proposal.orderType === "MARKET" ? input.proposal.estimatedPrice : input.proposal.limitPrice ?? "0");
        const reserved = new Prisma.Decimal(input.proposal.quantity).mul(price);
        await tx.botInstance.update({ where: { id: input.botId }, data: { reservedCapital: { increment: reserved } } });
      }
      await tx.executionJob.create({ data: { proposalId: proposal.id } });
    }
    else riskRejections.inc({ reason: decision.reason });
    return { proposal, decision };
  });
}
