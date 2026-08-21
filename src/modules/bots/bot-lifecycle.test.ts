import { describe, expect, it } from "vitest";
import { canDeleteBot, canCloneBot } from "./bot-lifecycle";

describe("bot lifecycle", () => {
  it("keeps a dead bot as immutable historical evidence", () => {
    expect(canDeleteBot({ lifeStatus: "DEAD", runMode: "OFF" })).toBe(false);
  });

  it("allows a dead configuration to be cloned into a new bot", () => {
    expect(canCloneBot({ lifeStatus: "DEAD" })).toBe(true);
  });

  it("never treats a clone as a revival of its source bot", () => {
    expect(canCloneBot({ lifeStatus: "ACTIVE" })).toBe(true);
    expect(canDeleteBot({ lifeStatus: "DEAD", runMode: "OFF" })).toBe(false);
  });
});
