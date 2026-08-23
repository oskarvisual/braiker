import { describe, expect, it } from "vitest";
import { defaultMacroGuardWindow, normalizeMacroGuardWindow } from "./macro-guard-settings";

describe("macro guard settings", () => {
  it("preserves the existing 10-minute-before and 15-minute-after defaults", () => {
    expect(defaultMacroGuardWindow).toEqual({ beforeMinutes: 10, afterMinutes: 15 });
  });

  it("accepts longer windows but never weakens the current safety floor", () => {
    expect(normalizeMacroGuardWindow({ beforeMinutes: 30, afterMinutes: 45 })).toEqual({ beforeMinutes: 30, afterMinutes: 45 });
    expect(() => normalizeMacroGuardWindow({ beforeMinutes: 9, afterMinutes: 15 })).toThrow("MACRO_GUARD_BEFORE_TOO_SHORT");
    expect(() => normalizeMacroGuardWindow({ beforeMinutes: 10, afterMinutes: 14 })).toThrow("MACRO_GUARD_AFTER_TOO_SHORT");
  });
});
