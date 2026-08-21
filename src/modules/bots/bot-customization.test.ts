import { describe, expect, it } from "vitest";
import { applyBotRiskLimits, applyTemplateRiskLimits } from "./bot-customization";

const profile = { maxPositionSize: "10", maxPortfolioExposure: "35", maxDailyLoss: "2", maxWeeklyLoss: "6", maxTradesPerDay: 4, allowMargin: false, allowShorting: false, allowOptions: false, allowLeverage: false, marketOrderBufferPct: "0.02" };

describe("bot customization", () => {
  it("allows a bot to become more restrictive than its base profile", () => {
    expect(applyBotRiskLimits(profile, { maxPositionSize: "7", maxDailyLoss: "1", maxTradesPerDay: 3 })).toMatchObject({ maxPositionSize: "7", maxDailyLoss: "1", maxTradesPerDay: 3 });
  });

  it("rejects limits that would make a bot riskier than its base profile", () => {
    expect(() => applyBotRiskLimits(profile, { maxPositionSize: "11", maxDailyLoss: "1", maxTradesPerDay: 3 })).toThrow("MAX_POSITION_SIZE_EXCEEDS_PROFILE");
  });

  it("allows an administrator to change a profile's defaults within its permanent safety envelope", () => {
    expect(applyTemplateRiskLimits(profile, { maxPositionSize: "15", maxDailyLoss: "4", maxTradesPerDay: 6 })).toMatchObject({ maxPositionSize: "15", maxDailyLoss: "4", maxTradesPerDay: 6 });
  });

  it("does not allow a profile default to exceed its permanent exposure envelope", () => {
    expect(() => applyTemplateRiskLimits(profile, { maxPositionSize: "36", maxDailyLoss: "4", maxTradesPerDay: 6 })).toThrow("MAX_POSITION_SIZE_EXCEEDS_PROFILE_ENVELOPE");
  });
});
