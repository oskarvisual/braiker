import { describe, expect, it } from "vitest";
import { buildDecisionReport } from "@/modules/decisions/decision-report";

describe("decision report", () => {
  it("creates an English causal report from snapshot to signal, AI review, risk, order and fills", () => {
    const report = buildDecisionReport({
      symbol: "SPY",
      action: "BUY",
      quantity: "0.5",
      estimatedPrice: "600",
      snapshot: { capturedAt: new Date("2026-08-21T15:31:00.000Z"), close: "600", feed: "iex", indicators: { ema9: 601, ema21: 598, rsi14: 59 } },
      signal: { confidence: 82, reason: "Trend and momentum aligned." },
      ai: { provider: "openai", model: "gpt-5.4-mini", recommendation: "CAUTION", rationale: "Confirmation is present but volatility remains.", risks: ["A sudden reversal"], evidence: ["Positive momentum"], inputTokens: 400, outputTokens: 100, estimatedCostUsd: "0.00075", error: null },
      risk: { approved: true, reason: "APPROVED", checks: [{ rule: "KILL_SWITCH", passed: true, detail: "Bot is enabled." }] },
      order: { status: "FILLED", clientOrderId: "braiker-safe-id", createdAt: new Date("2026-08-21T15:32:00.000Z") },
      fills: [{ quantity: "0.5", price: "599.95", filledAt: new Date("2026-08-21T15:32:04.000Z") }]
    });

    expect(report.summary).toContain("BrAIker submitted a BUY order for SPY");
    expect(report.steps.map((step) => step.title)).toEqual(["Market snapshot", "Deterministic signal", "AI review", "Risk decision", "Execution", "Fills"]);
    expect(report.steps[2].detail).toContain("advisory only");
    expect(report.steps[3].detail).toContain("APPROVED");
  });

  it("never implies an AI outage prevented safety checks or authorized a trade", () => {
    const report = buildDecisionReport({
      symbol: "SPY", action: "SELL", quantity: "1", estimatedPrice: "600", snapshot: null, signal: null,
      ai: { provider: "openai", model: "gpt-5.4-mini", recommendation: null, rationale: null, risks: [], evidence: [], inputTokens: null, outputTokens: null, estimatedCostUsd: null, error: "OPENAI_TIMEOUT" },
      risk: { approved: false, reason: "DAILY_LOSS_LIMIT", checks: [] }, order: null, fills: []
    });

    expect(report.steps[2].detail).toContain("did not change the deterministic risk path");
    expect(report.summary).toContain("was not submitted");
  });
});
