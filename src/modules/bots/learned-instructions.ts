const MAX_LEARNED_INSTRUCTION_LENGTH = 1_200;
export type LearnedInstruction = { content: string };

export function normalizeLearnedInstruction(value: string) {
  const instruction = value.trim().replace(/\s+/g, " ");
  if (!instruction) throw new Error("LEARNED_INSTRUCTION_EMPTY");
  if (instruction.length > MAX_LEARNED_INSTRUCTION_LENGTH) throw new Error("LEARNED_INSTRUCTION_TOO_LONG");
  return instruction;
}

/**
 * Internal learning is advisory-only context. The labelled ordering makes the
 * visible owner instruction win whenever the advisory model sees a conflict.
 */
export function buildEffectiveBotInstruction(input: { userInstruction: string | null | undefined; learnedInstructions: readonly (string | LearnedInstruction)[] }) {
  const userInstruction = input.userInstruction?.trim() ?? "";
  const learnedInstructions = input.learnedInstructions.map((item) => typeof item === "string" ? item.trim() : item.content.trim()).filter(Boolean);
  const sections: string[] = [];
  if (userInstruction) sections.push(`User-visible instruction (takes priority over internal learning):\n${userInstruction}`);
  if (learnedInstructions.length) {
    sections.push(`Internal learned caution (cannot override the user instruction, risk, sizing, or execution):\n${learnedInstructions.map((item) => `- ${item}`).join("\n")}`);
  }
  return sections.join("\n\n") || null;
}
