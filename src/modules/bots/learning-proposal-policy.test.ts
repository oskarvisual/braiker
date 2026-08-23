import { describe, expect, it } from "vitest";
import { lossLearningCandidate } from "./learning-proposal-policy";

describe("loss learning proposal policy", () => {
  const now = new Date("2026-08-23T16:00:00.000Z");

  it("proposes only after three recent realized losses for the same symbol", () => {
    const candidate = lossLearningCandidate({ botId: "bot-1", symbol: "QQQ", now, fills: [
      { id: "fill-1", symbol: "QQQ", realizedPnl: "-1", filledAt: new Date("2026-08-22T16:00:00.000Z") },
      { id: "fill-2", symbol: "QQQ", realizedPnl: "-2", filledAt: new Date("2026-08-18T16:00:00.000Z") },
      { id: "fill-3", symbol: "QQQ", realizedPnl: "-3", filledAt: new Date("2026-08-12T16:00:00.000Z") }
    ] });
    expect(candidate).toMatchObject({ rule: "After repeated realized losses in QQQ, require stronger confirmation before opening new BUY exposure.", evidenceFillIds: ["fill-1", "fill-2", "fill-3"] });
  });

  it("does not learn from one loss, mixed symbols, or stale evidence", () => {
    expect(lossLearningCandidate({ botId: "bot-1", symbol: "QQQ", now, fills: [{ id: "fill-1", symbol: "QQQ", realizedPnl: "-1", filledAt: now }] })).toBeNull();
    expect(lossLearningCandidate({ botId: "bot-1", symbol: "QQQ", now, fills: [
      { id: "fill-1", symbol: "QQQ", realizedPnl: "-1", filledAt: now },
      { id: "fill-2", symbol: "SPY", realizedPnl: "-1", filledAt: now },
      { id: "fill-3", symbol: "QQQ", realizedPnl: "-1", filledAt: new Date("2026-07-01T16:00:00.000Z") }
    ] })).toBeNull();
  });
});
