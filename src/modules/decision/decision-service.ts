import { OrderType, Prisma, TradeAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assessRisk } from "@/modules/risk/risk-engine";
import type { RiskContext, RiskPolicy } from "@/modules/risk/types";
import type { TradeProposalInput } from "@/modules/domain/contracts";
import { riskRejections } from "@/modules/monitoring/metrics";
import { shouldQueuePaperExecution } from "@/modules/bots/bot-templates";
import { reservationAmount, reserveBotCapital } from "@/modules/decision/reservation";

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
    let decision = assessRisk(input.proposal, { ...input.riskContext, botCapitalAvailable }, input.policy);
    const proposedReservation = reservationAmount(input.proposal, input.policy.marketOrderBufferPct);
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
        reservationAmount: proposedReservation,
        status: decision.approved ? "RISK_APPROVED" : "RISK_REJECTED",
        context: input.marketContext as Prisma.InputJsonValue
      }
    });
    await tx.riskDecision.create({ data: { proposalId: proposal.id, approved: decision.approved, reason: decision.reason, checks: decision.checks as Prisma.InputJsonValue, approvedOrder: decision.approvedOrder as Prisma.InputJsonValue | undefined } });
    if (shouldQueuePaperExecution(bot.runMode, decision.approved)) {
      const reserved = await reserveBotCapital(tx, { botId: input.botId, amount: proposedReservation });
      if (!reserved) {
        decision = {
          approved: false,
          reason: "BOT_BUDGET_AVAILABLE",
          checks: [...decision.checks, { rule: "ATOMIC_CAPITAL_RESERVATION", passed: false, detail: "Capital was reserved by a concurrent proposal or the bot was stopped" }]
        };
        await tx.tradeProposal.update({ where: { id: proposal.id }, data: { status: "RISK_REJECTED" } });
        await tx.riskDecision.update({ where: { proposalId: proposal.id }, data: { approved: false, reason: decision.reason, checks: decision.checks as Prisma.InputJsonValue, approvedOrder: Prisma.JsonNull } });
        riskRejections.inc({ reason: decision.reason });
      } else {
        await tx.executionJob.create({ data: { proposalId: proposal.id } });
      }
    }
    else riskRejections.inc({ reason: decision.reason });
    return { proposal, decision };
  });
}
