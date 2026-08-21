import type { RiskPolicy } from "@/modules/risk/types";

export type BotRiskLimits = Pick<RiskPolicy, "maxPositionSize" | "maxDailyLoss" | "maxTradesPerDay">;

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
