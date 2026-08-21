export type DecisionReportInput = {
  symbol: string;
  action: string;
  quantity: string;
  estimatedPrice: string;
  snapshot: { capturedAt: Date; close: string; feed: string; indicators: Record<string, unknown> } | null;
  signal: { confidence: number; reason: string } | null;
  ai: { provider: string; model: string; recommendation: string | null; rationale: string | null; risks: string[]; evidence: string[]; inputTokens: number | null; outputTokens: number | null; estimatedCostUsd: string | null; error: string | null } | null;
  risk: { approved: boolean; reason: string; checks: Array<{ rule: string; passed: boolean; detail: string }> } | null;
  order: { status: string; clientOrderId: string; createdAt: Date } | null;
  fills: Array<{ quantity: string; price: string; filledAt: Date }>;
};

export type DecisionReport = { summary: string; steps: Array<{ title: string; state: "complete" | "blocked" | "pending"; detail: string }> };

export function buildDecisionReport(input: DecisionReportInput): DecisionReport {
  const wasSubmitted = Boolean(input.order);
  const summary = wasSubmitted
    ? `BrAIker submitted a ${input.action} order for ${input.symbol} after the deterministic signal and risk controls completed their checks.`
    : `The ${input.action} candidate for ${input.symbol} was not submitted because the safety path did not approve an executable order.`;
  const snapshot = input.snapshot
    ? `Captured ${input.symbol} at $${input.snapshot.close} from the ${input.snapshot.feed.toUpperCase()} feed. Indicators were recorded with the decision snapshot.`
    : "No market snapshot is linked to this proposal.";
  const signal = input.signal
    ? `${input.signal.confidence}% deterministic confidence. ${input.signal.reason}`
    : "No deterministic signal is linked to this proposal.";
  const ai = !input.ai
    ? "AI review was disabled or was not requested for this candidate. The deterministic risk path remained authoritative."
    : input.ai.error
      ? `AI review was unavailable (${input.ai.error}) and did not change the deterministic risk path or authorize a trade.`
      : `${input.ai.provider} ${input.ai.model} returned ${input.ai.recommendation}. ${input.ai.rationale} This review was advisory only and could not approve risk or submit an order.`;
  const risk = !input.risk
    ? "No risk decision is linked to this proposal."
    : `${input.risk.approved ? "Approved" : "Rejected"}: ${input.risk.reason}. ${input.risk.checks.length} durable check${input.risk.checks.length === 1 ? "" : "s"} recorded.`;
  const execution = input.order
    ? `Broker order ${input.order.status.replaceAll("_", " ").toLowerCase()} at ${input.order.createdAt.toISOString()}. Idempotent client order ID: ${input.order.clientOrderId}.`
    : "No broker order was created.";
  const fills = input.fills.length
    ? input.fills.map((fill) => `${fill.quantity} shares at $${fill.price} on ${fill.filledAt.toISOString()}`).join("; ")
    : "No fills have been reported yet.";
  return {
    summary,
    steps: [
      { title: "Market snapshot", state: input.snapshot ? "complete" : "pending", detail: snapshot },
      { title: "Deterministic signal", state: input.signal ? "complete" : "pending", detail: signal },
      { title: "AI review", state: input.ai?.error ? "blocked" : input.ai ? "complete" : "pending", detail: ai },
      { title: "Risk decision", state: input.risk?.approved ? "complete" : input.risk ? "blocked" : "pending", detail: risk },
      { title: "Execution", state: input.order ? "complete" : "pending", detail: execution },
      { title: "Fills", state: input.fills.length ? "complete" : "pending", detail: fills }
    ]
  };
}
