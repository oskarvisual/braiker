import type { RiskPolicy } from "@/modules/risk/types";

export type BotRiskLimits = Pick<RiskPolicy, "maxPositionSize" | "maxDailyLoss" | "maxTradesPerDay">;

/**
 * Changes the three administrator-configurable defaults for a personality.
 * The remainder of the base profile is a permanent safety envelope: no
 * configuration UI can enable leverage or widen portfolio/weekly-loss limits.
 */
export function applyTemplateRiskLimits(profile: RiskPolicy, limits: BotRiskLimits): RiskPolicy {
  const maxPositionSize = limits.maxPositionSize;
  const maxDailyLoss = limits.maxDailyLoss;
  const maxTradesPerDay = limits.maxTradesPerDay;
  if (Number(maxPositionSize) <= 0 || Number(maxPositionSize) > Number(profile.maxPortfolioExposure)) throw new Error("MAX_POSITION_SIZE_EXCEEDS_PROFILE_ENVELOPE");
  if (Number(maxDailyLoss) <= 0 || Number(maxDailyLoss) > Number(profile.maxWeeklyLoss)) throw new Error("MAX_DAILY_LOSS_EXCEEDS_PROFILE_ENVELOPE");
  if (!Number.isInteger(maxTradesPerDay) || maxTradesPerDay < 1 || maxTradesPerDay > profile.maxTradesPerDay * 2) throw new Error("MAX_TRADES_EXCEEDS_PROFILE_ENVELOPE");
  return { ...profile, maxPositionSize, maxDailyLoss, maxTradesPerDay };
}

export function applyBotRiskLimits(profile: RiskPolicy, limits?: Partial<BotRiskLimits>): RiskPolicy {
  if (!limits) return profile;
  const maxPositionSize = limits.maxPositionSize ?? profile.maxPositionSize;
  const maxDailyLoss = limits.maxDailyLoss ?? profile.maxDailyLoss;
  const maxTradesPerDay = limits.maxTradesPerDay ?? profile.maxTradesPerDay;
  if (Number(maxPositionSize) <= 0 || Number(maxPositionSize) > Number(profile.maxPositionSize)) throw new Error("MAX_POSITION_SIZE_EXCEEDS_PROFILE");
  if (Number(maxDailyLoss) <= 0 || Number(maxDailyLoss) > Number(profile.maxDailyLoss)) throw new Error("MAX_DAILY_LOSS_EXCEEDS_PROFILE");
  if (!Number.isInteger(maxTradesPerDay) || maxTradesPerDay < 1 || maxTradesPerDay > profile.maxTradesPerDay) throw new Error("MAX_TRADES_EXCEEDS_PROFILE");
  return { ...profile, maxPositionSize, maxDailyLoss, maxTradesPerDay };
}
