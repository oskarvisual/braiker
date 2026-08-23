import { parseManagerMacroEventIntent } from "./manager-macro-intents";

type MacroEventDb = {
  resourceSource: { findFirst(args: object): Promise<{ id: string; hostname: string } | null> };
  macroCalendarEvent: { create(args: object): Promise<{ id: string; title: string; startsAt: Date; sourceUrl: string }> };
  auditLog: { create(args: object): Promise<unknown> };
};

function trustedHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch { return null; }
}

/** The manager only accepts an explicit event command backed by an approved MACRO source. */
export async function createManagerMacroEvent(input: { userId: string; content: string; source: "WEB" | "TELEGRAM"; sourceReference?: string; now?: Date }, db: MacroEventDb) {
  const intent = parseManagerMacroEventIntent(input.content);
  if (!intent) return null;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(intent.startsAt)) return { reply: "The macro event was not created: its ISO timestamp must include a timezone." };
  const startsAt = new Date(intent.startsAt);
  const url = trustedHttpsUrl(intent.sourceUrl);
  if (!url || Number.isNaN(startsAt.getTime())) return { reply: "The macro event was not created: use a future ISO timestamp with timezone and an HTTPS source URL." };
  if (startsAt <= (input.now ?? new Date())) return { reply: "The macro event was not created because its timestamp is not in the future." };
  const source = await db.resourceSource.findFirst({ where: { category: "MACRO", active: true, reviewStatus: "APPROVED", hostname: url.hostname }, select: { id: true, hostname: true } });
  if (!source) return { reply: "The macro event was not created because that URL host is not an active, approved MACRO Resource." };
  try {
    const event = await db.macroCalendarEvent.create({ data: { provider: "BOT_MANAGER", externalId: source.id, title: intent.title, impact: "HIGH", startsAt, sourceUrl: url.toString(), sourceReference: input.sourceReference ?? `${input.source}:manager-chat`, createdById: input.userId } });
    await db.auditLog.create({ data: { userId: input.userId, action: "MACRO_EVENT_CREATED_BY_MANAGER", target: event.id, metadata: { sourceId: source.id, sourceUrl: event.sourceUrl, actorSource: input.source, startsAt: event.startsAt.toISOString() } } });
    return { reply: `Created HIGH macro event “${event.title}” for ${event.startsAt.toISOString()} from approved source ${source.hostname}. It will block only new BUY proposals during the configured guard window.` };
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: string }).code === "P2002") return { reply: "That macro event already exists; no duplicate was created." };
    throw error;
  }
}
