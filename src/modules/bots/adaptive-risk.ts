import { Prisma } from "@prisma/client";
import type { RiskPolicy } from "@/modules/risk/types";

export type AdaptiveRiskLevel = "MANUAL" | "BASELINE" | "CAUTIOUS" | "PROTECTIVE";

export type AdaptiveRiskInput = {
  enabled: boolean;
  basePolicy: RiskPolicy;
  initialCapital: string;
  currentCapital: string;
  reservedCapital: string;
  openPositionCount: number;
};

export type AdaptiveRiskResult = {
  level: AdaptiveRiskLevel;
  reason: string;
  effectivePolicy: RiskPolicy;
};

/** Survival reductions protect new exposure only; a reducing exit keeps the
 * bot's saved base policy available. */
export function policyForAdaptiveTrade(action: "BUY" | "SELL", basePolicy: RiskPolicy, adaptivePolicy: RiskPolicy) {
  return action === "SELL" ? basePolicy : adaptivePolicy;
}

function scaleMoney(value: string, factor: string) {
  return new Prisma.Decimal(value).mul(new Prisma.Decimal(factor)).toDecimalPlaces(12, Prisma.Decimal.ROUND_DOWN).toString();
}

function scaledPolicy(basePolicy: RiskPolicy, factor: "0.5" | "0.25"): RiskPolicy {
  return {
    ...basePolicy,
    maxPositionSize: scaleMoney(basePolicy.maxPositionSize, factor),
    maxDailyLoss: scaleMoney(basePolicy.maxDailyLoss, factor),
    maxTradesPerDay: Math.max(1, Math.floor(basePolicy.maxTradesPerDay * Number(factor)))
  };
}

/**
 * Adaptive risk is an opt-in survival posture. It can only reduce the bot's
 * saved envelope; the saved policy remains the administrator-owned ceiling.
 */
export function resolveAdaptiveRiskPolicy(input: AdaptiveRiskInput): AdaptiveRiskResult {
  if (!input.enabled) return { level: "MANUAL", reason: "Adaptive risk is disabled; the administrator-selected envelope remains active.", effectivePolicy: input.basePolicy };
  if (input.openPositionCount > 0 || new Prisma.Decimal(input.reservedCapital).gt(0)) {
    return { level: "BASELINE", reason: "Capital is deployed or reserved, so liquid cash alone is not treated as a survival loss.", effectivePolicy: input.basePolicy };
  }

  const initialCapital = new Prisma.Decimal(input.initialCapital);
  const currentCapital = new Prisma.Decimal(input.currentCapital);
  if (initialCapital.lte(0) || currentCapital.gte(initialCapital.mul("0.85"))) {
    return { level: "BASELINE", reason: "Remaining capital is within the adaptive survival baseline.", effectivePolicy: input.basePolicy };
  }
  if (currentCapital.lt(initialCapital.mul("0.5"))) {
    return { level: "PROTECTIVE", reason: "Remaining capital is below 50% of the starting allocation; the survival posture applies a 75% reduction.", effectivePolicy: scaledPolicy(input.basePolicy, "0.25") };
  }
  return { level: "CAUTIOUS", reason: "Remaining capital is below 85% of the starting allocation; the survival posture applies a 50% reduction.", effectivePolicy: scaledPolicy(input.basePolicy, "0.5") };
}
