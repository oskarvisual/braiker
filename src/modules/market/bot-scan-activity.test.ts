import { describe, expect, it } from "vitest";
import { botScanRetentionCutoff, buildBotScanActivity } from "@/modules/market/bot-scan-activity";

describe("bot scan activity", () => {
  it("summarizes a completed cycle in plain English without exposing internals", () => {
    expect(buildBotScanActivity({
      state: "COMPLETED",
      outcomes: [
        { symbol: "SPY", outcome: "hold" },
        { symbol: "AAPL", outcome: "approved" },
        { symbol: "QQQ", outcome: "ai-rejected" }
      ]
    })).toEqual({
      status: "COMPLETED",
      reason: "ANALYZED",
      message: "Analyzed 3 symbols: 1 hold, 1 approved for Paper execution, 1 stopped by AI advisory.",
      outcomes: [
        { symbol: "SPY", outcome: "HOLD", message: "No trade candidate met the strategy threshold." },
        { symbol: "AAPL", outcome: "APPROVED", message: "Candidate passed risk checks and was queued for Paper execution." },
        { symbol: "QQQ", outcome: "AI_REJECTED", message: "Candidate was stopped by the AI advisory before risk assessment." }
      ]
    });
  });

  it("records a skipped market-closed cycle without creating a false error", () => {
    expect(buildBotScanActivity({ state: "MARKET_CLOSED", outcomes: [] })).toMatchObject({
      status: "SKIPPED",
      reason: "MARKET_CLOSED",
      message: "Waiting: the US regular market is closed."
    });
  });

  it("redacts runtime errors from the operator-facing analysis feed", () => {
    expect(buildBotScanActivity({ state: "ERROR", outcomes: [] })).toMatchObject({
      status: "ERROR",
      reason: "CYCLE_ERROR",
      message: "Analysis cycle could not finish. It will retry on the next cycle."
    });
  });

  it("keeps only thirty days of durable analysis activity", () => {
    expect(botScanRetentionCutoff(new Date("2026-08-21T12:00:00.000Z")).toISOString()).toBe("2026-07-22T12:00:00.000Z");
  });
});
