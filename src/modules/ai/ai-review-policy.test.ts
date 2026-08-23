import { describe, expect, it } from "vitest";
import { aiReviewEligibility, sanitizedBotInstruction } from "@/modules/ai/ai-review-policy";

describe("AI review eligibility", () => {
  it("does not call an AI provider while the explicit feature flag is off", () => {
    expect(aiReviewEligibility({ enabled: false, analysesToday: 0, dailyLimit: 10 })).toEqual({ allowed: false, reason: "AI_DISABLED" });
  });

  it("caps per-bot reviews before an external call is attempted", () => {
    expect(aiReviewEligibility({ enabled: true, analysesToday: 10, dailyLimit: 10 })).toEqual({ allowed: false, reason: "AI_DAILY_ANALYSIS_LIMIT" });
    expect(aiReviewEligibility({ enabled: true, analysesToday: 9, dailyLimit: 10 })).toEqual({ allowed: true, reason: null });
  });

  it("labels the visible additional instruction as higher priority than learned caution", () => {
    expect(sanitizedBotInstruction({ customInstructions: "Prioritize liquid ETFs." })).toContain("User-visible instruction (takes priority over internal learning):\nPrioritize liquid ETFs.");
    expect(sanitizedBotInstruction({ customInstructions: "Prioritize liquid ETFs." }, [{ content: "Wait for stronger confirmation." }])).toContain("Internal learned caution");
    expect(sanitizedBotInstruction({ customInstructions: 42 })).toBeNull();
    expect(sanitizedBotInstruction(null)).toBeNull();
  });
});
