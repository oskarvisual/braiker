import { normalizeLearnedInstruction } from "./learned-instructions";

type LearnedInstructionDb = {
  botLearnedInstruction: {
    findFirst(args: object): Promise<{ revision: number; content: string } | null>;
    create(args: object): Promise<{ id: string; revision: number; content: string }>;
  };
  auditLog: { create(args: object): Promise<unknown> };
};

/** A duplicate active rule is not another revision: it is an idempotent no-op. */
export async function recordLearnedInstruction(input: { botId: string; userId: string; content: string; source: "MANAGER_CHAT" | "BOT_CHAT" | "CLONE" | "LEARNING_PROPOSAL"; walletId?: string }, db: LearnedInstructionDb) {
  const content = normalizeLearnedInstruction(input.content);
  const latest = await db.botLearnedInstruction.findFirst({ where: { botId: input.botId }, orderBy: { revision: "desc" }, select: { revision: true, content: true } });
  if (latest?.content === content) return { created: false, instruction: latest };
  const instruction = await db.botLearnedInstruction.create({ data: { botId: input.botId, createdById: input.userId, content, source: input.source, revision: (latest?.revision ?? 0) + 1 } });
  await db.auditLog.create({ data: { userId: input.userId, ...(input.walletId ? { walletId: input.walletId } : {}), action: "BOT_LEARNED_INSTRUCTION_RECORDED", target: instruction.id, metadata: { botId: input.botId, revision: instruction.revision, source: input.source } } });
  return { created: true, instruction };
}

export function parseBotLearningCommand(content: string) {
  const match = /^(?:recordar|remember)\s*:\s*(.+)$/i.exec(content.trim());
  return match?.[1] ?? null;
}

export function parseManagerLearningCommand(content: string) {
  const match = /^(?:recordar|remember)\s+(?:para|for)\s+(.+?)\s*:\s*(.+)$/i.exec(content.trim());
  return match ? { botName: match[1]!.trim().replace(/^(?:the\s+)?bot\s+/i, ""), content: match[2]!.trim() } : null;
}
