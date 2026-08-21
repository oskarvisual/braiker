import { describe, expect, it } from "vitest";
import { applyBotRiskLimits } from "./bot-customization";

const profile = { maxPositionSize: "10", maxPortfolioExposure: "35", maxDailyLoss: "2", maxWeeklyLoss: "6", maxTradesPerDay: 4, allowMargin: false, allowShorting: false, allowOptions: false, allowLeverage: false, marketOrderBufferPct: "0.02" };

describe("bot customization", () => {
  it("allows a bot to become more restrictive than its base profile", () => {
    expect(applyBotRiskLimits(profile, { maxPositionSize: "7", maxDailyLoss: "1", maxTradesPerDay: 3 })).toMatchObject({ maxPositionSize: "7", maxDailyLoss: "1", maxTradesPerDay: 3 });
  });

  it("rejects limits that would make a bot riskier than its base profile", () => {
    expect(() => applyBotRiskLimits(profile, { maxPositionSize: "11", maxDailyLoss: "1", maxTradesPerDay: 3 })).toThrow("MAX_POSITION_SIZE_EXCEEDS_PROFILE");
  });
});
