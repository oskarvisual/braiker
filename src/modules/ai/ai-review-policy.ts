export function aiReviewEligibility(input: { enabled: boolean; analysesToday: number; dailyLimit: number }) {
  if (!input.enabled) return { allowed: false, reason: "AI_DISABLED" as const };
  if (input.analysesToday >= input.dailyLimit) return { allowed: false, reason: "AI_DAILY_ANALYSIS_LIMIT" as const };
  return { allowed: true, reason: null };
}

export function sanitizedBotInstruction(strategyProfile: unknown) {
  if (!strategyProfile || typeof strategyProfile !== "object") return null;
  const value = (strategyProfile as { customInstructions?: unknown }).customInstructions;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
