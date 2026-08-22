import { describe, expect, it } from "vitest";
import { deriveBotSurvivalState } from "./survival-state";

describe("deriveBotSurvivalState", () => {
  const active = {
    lifeStatus: "ACTIVE" as const,
    initialCapital: "100.000000000000",
    currentCapital: "100.000000000000",
    reservedCapital: "0.000000000000",
    openPositionCount: 0,
    lastAnalysisAt: "2026-08-21T12:00:00.000Z"
  };

  it("keeps a dead bot dead regardless of its balances or recent analysis", () => {
    expect(deriveBotSurvivalState({ ...active, lifeStatus: "DEAD", currentCapital: "100.000000000000" })).toMatchObject({ code: "DEAD", score: 0, operationalStatus: "Trading stopped permanently" });
  });

  it("shows calibrating until the bot has completed its first analysis cycle", () => {
    expect(deriveBotSurvivalState({ ...active, lastAnalysisAt: null })).toMatchObject({ code: "CALIBRATING", score: null, operationalStatus: "Awaiting first analysis" });
  });

  it("does not infer stress from low liquid cash while capital is deployed or reserved", () => {
    expect(deriveBotSurvivalState({ ...active, currentCapital: "1.000000000000", openPositionCount: 1 })).toMatchObject({ code: "STABLE", score: 75 });
    expect(deriveBotSurvivalState({ ...active, currentCapital: "1.000000000000", reservedCapital: "10.000000000000" })).toMatchObject({ code: "STABLE", score: 75 });
  });

  it("derives liquid-capital bands using decimal strings rather than JavaScript floats", () => {
    expect(deriveBotSurvivalState({ ...active, currentCapital: "105.000000000000" }).code).toBe("THRIVING");
    expect(deriveBotSurvivalState({ ...active, currentCapital: "84.999999999999" }).code).toBe("CAUTIOUS");
    expect(deriveBotSurvivalState({ ...active, currentCapital: "49.999999999999" }).code).toBe("STRESSED");
    expect(deriveBotSurvivalState({ ...active, currentCapital: "19.999999999999" }).code).toBe("CRITICAL");
  });

  it("keeps the health reading separate from a reversible manual pause", () => {
    expect(deriveBotSurvivalState({ ...active, killSwitch: true })).toMatchObject({ code: "STABLE", score: 75, operationalStatus: "Trading paused" });
  });
});
