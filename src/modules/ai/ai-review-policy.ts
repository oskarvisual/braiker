export function aiReviewEligibility(input: { enabled: boolean; analysesToday: number; dailyLimit: number }) {
  if (!input.enabled) return { allowed: false, reason: "AI_DISABLED" as const };
  if (input.analysesToday >= input.dailyLimit) return { allowed: false, reason: "AI_DAILY_ANALYSIS_LIMIT" as const };
  return { allowed: true, reason: null };
}

export function sanitizedBotInstruction(strategyProfile: unknown, learnedInstructions: LearnedInstruction[] = []) {
  if (!strategyProfile || typeof strategyProfile !== "object") return null;
  const value = (strategyProfile as { customInstructions?: unknown }).customInstructions;
  return buildEffectiveBotInstruction({ userInstruction: typeof value === "string" ? value : null, learnedInstructions });
}
import { buildEffectiveBotInstruction, type LearnedInstruction } from "@/modules/bots/learned-instructions";
