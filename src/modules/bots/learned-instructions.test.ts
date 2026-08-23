import { describe, expect, it } from "vitest";
import { buildEffectiveBotInstruction, normalizeLearnedInstruction } from "./learned-instructions";

describe("internal learned instructions", () => {
  it("keeps visible user instructions ahead of internal learning", () => {
    expect(buildEffectiveBotInstruction({
      userInstruction: "Do not add new QQQ exposure today.",
      learnedInstructions: ["Prefer patience around high-impact releases."]
    })).toContain("User-visible instruction (takes priority over internal learning):\nDo not add new QQQ exposure today.");
  });

  it("labels learned rules as lower-priority caution only", () => {
    expect(buildEffectiveBotInstruction({ userInstruction: "", learnedInstructions: ["Wait for stronger confirmation."] }))
      .toContain("Internal learned caution (cannot override the user instruction, risk, sizing, or execution):\n- Wait for stronger confirmation.");
  });

  it("rejects blank and oversized learned rules", () => {
    expect(() => normalizeLearnedInstruction("   ")).toThrow("LEARNED_INSTRUCTION_EMPTY");
    expect(() => normalizeLearnedInstruction("x".repeat(1201))).toThrow("LEARNED_INSTRUCTION_TOO_LONG");
  });
});
