import type { PrismaClient, UserRole } from "@prisma/client";
import { createManagerActionProposal, type ManagerAction } from "./manager-action-proposals";

type ManagerPowerDb = Pick<PrismaClient, "botInstance" | "managerActionProposal">;

export type ManagerPowerIntent = { action: ManagerAction; botReference: string };

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function referenceFrom(match: RegExpExecArray) {
  return match[1]!.trim().replace(/^(?:the\s+)?bot\s+/i, "").replace(/^a\s+/i, "").replace(/[.!?]+$/, "").trim();
}

/** Parses only explicit power requests. Unknown or conversational text stays read-only. */
export function parseManagerPowerIntent(content: string): ManagerPowerIntent | null {
  const value = content.trim();
  const on = /^(?:please\s+)?(?:activate|turn\s+on|enable|activar|activa|enciende)\s+(.+)$/i.exec(value);
  if (on) {
    const botReference = referenceFrom(on);
    return botReference ? { action: "TURN_ON", botReference } : null;
  }
  const off = /^(?:please\s+)?(?:deactivate|turn\s+off|disable|desactivar|desactiva|apaga)\s+(.+)$/i.exec(value);
  if (off) {
    const botReference = referenceFrom(off);
    return botReference ? { action: "TURN_OFF", botReference } : null;
  }
  return null;
}

export type ManagerPowerProposalResult =
  | { kind: "none" }
  | { kind: "unmatched"; intent: ManagerPowerIntent; reply: string }
  | { kind: "ambiguous"; intent: ManagerPowerIntent; reply: string }
  | { kind: "proposal"; action: ManagerAction; bot: { id: string; name: string }; id: string; expiresAt: Date; confirmationCode: string; reply: string };

/**
 * Resolves the same named power request for web and Telegram. It never uses
 * fuzzy matching: a typo must not power a different bot.
 */
export async function prepareManagerPowerProposal(
  input: { userId: string; actorRole: UserRole; content: string; requestedVia: "WEB" | "TELEGRAM"; now?: Date; code?: string },
  db: ManagerPowerDb
): Promise<ManagerPowerProposalResult> {
  const intent = parseManagerPowerIntent(input.content);
  if (!intent) return { kind: "none" };
  const bots = await db.botInstance.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 100 });
  const matches = bots.filter((bot) => normalized(bot.name) === normalized(intent.botReference));
  if (matches.length === 0) {
    const names = bots.map((bot) => bot.name).join(", ") || "no bots";
    return { kind: "unmatched", intent, reply: `I could not find an exact bot named “${intent.botReference}”. Use one of: ${names}. No change was prepared.` };
  }
  if (matches.length > 1) return { kind: "ambiguous", intent, reply: `More than one bot matches “${intent.botReference}”. No change was prepared.` };
  const bot = matches[0]!;
  const proposal = await createManagerActionProposal({
    userId: input.userId,
    actorRole: input.actorRole,
    botId: bot.id,
    action: intent.action,
    requestedVia: input.requestedVia,
    now: input.now,
    code: input.code
  }, db);
  const operation = intent.action === "TURN_ON" ? "turn ON" : "turn OFF";
  return {
    kind: "proposal",
    action: intent.action,
    bot,
    id: proposal.id,
    expiresAt: proposal.expiresAt,
    confirmationCode: proposal.confirmationCode,
    reply: `Proposal prepared to ${operation} ${bot.name}. Review the impact and confirm before it expires; no change has been applied yet.`
  };
}
