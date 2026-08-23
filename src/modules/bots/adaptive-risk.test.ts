import { describe, expect, it } from "vitest";
import { policyForAdaptiveTrade, resolveAdaptiveRiskPolicy } from "./adaptive-risk";

const basePolicy = {
  maxPositionSize: "10",
  maxPortfolioExposure: "35",
  maxDailyLoss: "2",
  maxWeeklyLoss: "6",
  maxTradesPerDay: 4,
  allowMargin: false,
  allowShorting: false,
  allowOptions: false,
  allowLeverage: false,
  marketOrderBufferPct: "0.02"
};

describe("adaptive bot risk", () => {
  it("keeps the administrator's saved envelope unchanged while adaptive risk is off", () => {
    const result = resolveAdaptiveRiskPolicy({ enabled: false, basePolicy, initialCapital: "100", currentCapital: "10", reservedCapital: "0", openPositionCount: 0 });

    expect(result).toMatchObject({ level: "MANUAL", effectivePolicy: basePolicy });
  });

  it("reduces exposure, loss room, and trade count after a realized survival drawdown", () => {
    const result = resolveAdaptiveRiskPolicy({ enabled: true, basePolicy, initialCapital: "100", currentCapital: "84.999999999999", reservedCapital: "0", openPositionCount: 0 });

    expect(result).toMatchObject({ level: "CAUTIOUS", effectivePolicy: { maxPositionSize: "5", maxDailyLoss: "1", maxTradesPerDay: 2 } });
  });

  it("uses a protective floor after a severe drawdown without ever widening the saved envelope", () => {
    const result = resolveAdaptiveRiskPolicy({ enabled: true, basePolicy, initialCapital: "100", currentCapital: "49.999999999999", reservedCapital: "0", openPositionCount: 0 });

    expect(result).toMatchObject({ level: "PROTECTIVE", effectivePolicy: { maxPositionSize: "2.5", maxDailyLoss: "0.5", maxTradesPerDay: 1 } });
    expect(Number(result.effectivePolicy.maxPositionSize)).toBeLessThanOrEqual(Number(basePolicy.maxPositionSize));
    expect(Number(result.effectivePolicy.maxDailyLoss)).toBeLessThanOrEqual(Number(basePolicy.maxDailyLoss));
    expect(result.effectivePolicy.maxTradesPerDay).toBeLessThanOrEqual(basePolicy.maxTradesPerDay);
  });

  it("does not mistake capital currently deployed or reserved for a realized survival loss", () => {
    const result = resolveAdaptiveRiskPolicy({ enabled: true, basePolicy, initialCapital: "100", currentCapital: "1", reservedCapital: "10", openPositionCount: 1 });

    expect(result).toMatchObject({ level: "BASELINE", effectivePolicy: basePolicy });
  });

  it("applies the reduced posture only to new BUY exposure and preserves exits", () => {
    const reduced = { ...basePolicy, maxPositionSize: "2.5", maxDailyLoss: "0.5", maxTradesPerDay: 1 };

    expect(policyForAdaptiveTrade("BUY", basePolicy, reduced)).toEqual(reduced);
    expect(policyForAdaptiveTrade("SELL", basePolicy, reduced)).toEqual(basePolicy);
  });
});
