export type ManagerMacroEventIntent = { title: string; startsAt: string; sourceUrl: string };

/** Only an explicit three-part command can become a macro-safety event. */
export function parseManagerMacroEventIntent(content: string): ManagerMacroEventIntent | null {
  const match = /^(?:evento\s+macro|macro\s+event)\s*:\s*([^|]{2,255})\|\s*([^|]+)\|\s*(https:\/\/\S+)\s*$/i.exec(content.trim());
  if (!match) return null;
  return { title: match[1]!.trim(), startsAt: match[2]!.trim(), sourceUrl: match[3]!.trim() };
}
