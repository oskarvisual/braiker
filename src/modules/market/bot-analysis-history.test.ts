import { describe, expect, it } from "vitest";
import { presentBotScanRun } from "@/modules/market/bot-analysis-history";

describe("bot analysis history presentation", () => {
  it("presents persisted analysis without trusting malformed JSON", () => {
    expect(presentBotScanRun({
      id: "scan-1",
      status: "COMPLETED",
      reason: "ANALYZED",
      message: "Analyzed 1 symbol: 1 hold.",
      outcomes: [{ symbol: "SPY", outcome: "HOLD", message: "No trade candidate met the strategy threshold." }],
      startedAt: new Date("2026-08-21T12:00:00.000Z"),
      completedAt: new Date("2026-08-21T12:00:02.000Z")
    })).toEqual({
      id: "scan-1",
      status: "COMPLETED",
      reason: "ANALYZED",
      message: "Analyzed 1 symbol: 1 hold.",
      outcomes: [{ symbol: "SPY", outcome: "HOLD", message: "No trade candidate met the strategy threshold." }],
      startedAt: "2026-08-21T12:00:00.000Z",
      completedAt: "2026-08-21T12:00:02.000Z"
    });
  });

  it("fails closed when old or malformed scan metadata is encountered", () => {
    expect(presentBotScanRun({ id: "scan-2", status: "ERROR", reason: "CYCLE_ERROR", message: "Analysis cycle could not finish. It will retry on the next cycle.", outcomes: { error: "secret" }, startedAt: new Date("2026-08-21T12:00:00.000Z"), completedAt: null }).outcomes).toEqual([]);
  });
});
