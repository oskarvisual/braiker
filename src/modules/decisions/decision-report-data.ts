import { prisma } from "@/lib/prisma";
import { buildDecisionReport } from "@/modules/decisions/decision-report";

type ReportUser = { id: string; role: string };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "—") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function textArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Returns the auditable, immutable decision view only when the requester can
 * access the proposal's wallet. Decimal fields are serialized as strings.
 */
export async function getDecisionReportForUser(proposalId: string, user: ReportUser) {
  const proposal = await prisma.tradeProposal.findUnique({
    where: { id: proposalId },
    include: { bot: { include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } } } } }
  });
  if (!proposal || (user.role !== "ADMIN" && proposal.bot.wallet.members.length === 0)) return null;

  const [signal, ai, risk, order] = await Promise.all([
    proposal.signalId ? prisma.strategySignal.findUnique({ where: { id: proposal.signalId } }) : null,
    proposal.aiDecisionId ? prisma.aiDecision.findUnique({ where: { id: proposal.aiDecisionId } }) : null,
    prisma.riskDecision.findUnique({ where: { proposalId: proposal.id } }),
    prisma.order.findFirst({ where: { proposalId: proposal.id }, include: { fills: { orderBy: { filledAt: "asc" } } } })
  ]);
  const snapshot = signal?.snapshotId ? await prisma.marketSnapshot.findUnique({ where: { id: signal.snapshotId } }) : null;
  const snapshotPayload = object(snapshot?.payload);
  const candle = object(snapshotPayload.candle);
  const indicators = object(snapshotPayload.indicators);
  const aiResponse = object(ai?.response);
  const riskChecks = Array.isArray(risk?.checks) ? risk.checks.map((check) => {
    const item = object(check);
    return { rule: text(item.rule), passed: item.passed === true, detail: text(item.detail) };
  }) : [];
  const report = buildDecisionReport({
    symbol: proposal.symbol,
    action: proposal.action,
    quantity: proposal.quantity.toString(),
    estimatedPrice: proposal.estimatedPrice.toString(),
    snapshot: snapshot ? { capturedAt: snapshot.createdAt, close: text(candle.close), feed: text(candle.feed, "unknown"), indicators } : null,
    signal: signal ? { confidence: signal.confidence, reason: signal.reason } : null,
    ai: ai ? { provider: ai.provider, model: ai.model, recommendation: typeof aiResponse.recommendation === "string" ? aiResponse.recommendation : null, rationale: typeof aiResponse.rationale === "string" ? aiResponse.rationale : null, risks: textArray(aiResponse.risks), evidence: textArray(aiResponse.evidence), inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, estimatedCostUsd: ai.costUsd?.toString() ?? null, error: ai.error } : null,
    risk: risk ? { approved: risk.approved, reason: risk.reason, checks: riskChecks } : null,
    order: order ? { status: order.status, clientOrderId: order.clientOrderId, createdAt: order.createdAt } : null,
    fills: order?.fills.map((fill) => ({ quantity: fill.quantity.toString(), price: fill.price.toString(), filledAt: fill.filledAt })) ?? []
  });

  return {
    botName: proposal.bot.name,
    action: proposal.action,
    symbol: proposal.symbol,
    summary: report.summary,
    steps: report.steps,
    indicators: Object.entries(indicators).map(([name, value]) => ({ name, value: text(value) })),
    riskChecks
  };
}
