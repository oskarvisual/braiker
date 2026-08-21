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
    expect(deriveBotSurvivalState({ ...active, lifeStatus: "DEAD", currentCapital: "100.000000000000" }).code).toBe("DEAD");
  });

  it("shows calibrating until the bot has completed its first analysis cycle", () => {
    expect(deriveBotSurvivalState({ ...active, lastAnalysisAt: null }).code).toBe("CALIBRATING");
  });

  it("does not infer stress from low liquid cash while capital is deployed or reserved", () => {
    expect(deriveBotSurvivalState({ ...active, currentCapital: "1.000000000000", openPositionCount: 1 }).code).toBe("STABLE");
    expect(deriveBotSurvivalState({ ...active, currentCapital: "1.000000000000", reservedCapital: "10.000000000000" }).code).toBe("STABLE");
  });

  it("derives liquid-capital bands using decimal strings rather than JavaScript floats", () => {
    expect(deriveBotSurvivalState({ ...active, currentCapital: "105.000000000000" }).code).toBe("THRIVING");
    expect(deriveBotSurvivalState({ ...active, currentCapital: "84.999999999999" }).code).toBe("CAUTIOUS");
    expect(deriveBotSurvivalState({ ...active, currentCapital: "49.999999999999" }).code).toBe("STRESSED");
    expect(deriveBotSurvivalState({ ...active, currentCapital: "19.999999999999" }).code).toBe("CRITICAL");
  });
});
