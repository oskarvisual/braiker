import { describe, expect, it } from "vitest";
import { activeMacroGuard } from "./macro-guard";

describe("macro event guard", () => {
  const event = { id: "cpi", title: "US CPI release", startsAt: new Date("2026-08-24T12:30:00.000Z"), impact: "HIGH", sourceUrl: "https://www.bls.gov/" };

  it("blocks new exposure from ten minutes before through fifteen minutes after a high-impact event", () => {
    expect(activeMacroGuard([event], new Date("2026-08-24T12:20:00.000Z"))).toMatchObject({ active: true, eventTitle: "US CPI release" });
    expect(activeMacroGuard([event], new Date("2026-08-24T12:45:00.000Z"))).toMatchObject({ active: true });
  });

  it("does not block outside the window or for non-high-impact events", () => {
    expect(activeMacroGuard([event], new Date("2026-08-24T12:19:59.999Z"))).toEqual({ active: false });
    expect(activeMacroGuard([{ ...event, impact: "MEDIUM" }], new Date("2026-08-24T12:30:00.000Z"))).toEqual({ active: false });
  });

  it("uses each event's own safe guard window", () => {
    const extended = { ...event, beforeMinutes: 30, afterMinutes: 45 };
    expect(activeMacroGuard([extended], new Date("2026-08-24T12:00:00.000Z"))).toMatchObject({ active: true });
    expect(activeMacroGuard([extended], new Date("2026-08-24T13:15:00.001Z"))).toEqual({ active: false });
  });
});
