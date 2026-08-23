export type MacroGuardWindow = { beforeMinutes: number; afterMinutes: number };

export const defaultMacroGuardWindow: MacroGuardWindow = { beforeMinutes: 10, afterMinutes: 15 };
export const MAX_MACRO_GUARD_MINUTES = 240;

export function normalizeMacroGuardWindow(input: MacroGuardWindow): MacroGuardWindow {
  if (!Number.isInteger(input.beforeMinutes) || input.beforeMinutes < defaultMacroGuardWindow.beforeMinutes) throw new Error("MACRO_GUARD_BEFORE_TOO_SHORT");
  if (!Number.isInteger(input.afterMinutes) || input.afterMinutes < defaultMacroGuardWindow.afterMinutes) throw new Error("MACRO_GUARD_AFTER_TOO_SHORT");
  if (input.beforeMinutes > MAX_MACRO_GUARD_MINUTES || input.afterMinutes > MAX_MACRO_GUARD_MINUTES) throw new Error("MACRO_GUARD_WINDOW_TOO_LONG");
  return { beforeMinutes: input.beforeMinutes, afterMinutes: input.afterMinutes };
}
