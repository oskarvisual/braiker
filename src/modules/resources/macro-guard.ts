import { defaultMacroGuardWindow, type MacroGuardWindow } from "./macro-guard-settings";

export type MacroCalendarEvent = { id: string; title: string; startsAt: Date; impact: string; sourceUrl: string };
export type MacroGuard = { active: false } | { active: true; eventId: string; eventTitle: string; startsAt: Date; sourceUrl: string };

/** High-impact event timing is data, not an LLM interpretation. A guard may
 * only prevent new exposure; it never prevents a risk-reducing exit. */
export function activeMacroGuard(events: MacroCalendarEvent[], now = new Date(), window: MacroGuardWindow = defaultMacroGuardWindow): MacroGuard {
  const event = events
    .filter((candidate) => candidate.impact === "HIGH")
    .filter((candidate) => now.getTime() >= candidate.startsAt.getTime() - window.beforeMinutes * 60_000 && now.getTime() <= candidate.startsAt.getTime() + window.afterMinutes * 60_000)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0];
  return event ? { active: true, eventId: event.id, eventTitle: event.title, startsAt: event.startsAt, sourceUrl: event.sourceUrl } : { active: false };
}
