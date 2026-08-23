import { describe, expect, it } from "vitest";
import { parseManagerMacroEventIntent } from "./manager-macro-intents";

describe("Manager macro-event intents", () => {
  it("accepts only an explicit structured command", () => {
    expect(parseManagerMacroEventIntent("Evento macro: US CPI release | 2026-09-10T08:30:00-04:00 | https://www.bls.gov/news.release/cpi.htm"))
      .toEqual({ title: "US CPI release", startsAt: "2026-09-10T08:30:00-04:00", sourceUrl: "https://www.bls.gov/news.release/cpi.htm" });
  });

  it("does not infer events from conversational text", () => {
    expect(parseManagerMacroEventIntent("CPI could be important next week")).toBeNull();
  });
});
