import { describe, expect, it } from "vitest";
import { isBotChatAvailable } from "./availability";

describe("bot chat availability", () => {
  it("uses the same runnable state as the bot control surface", () => {
    expect(isBotChatAvailable({ runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", status: "RUNNING", killSwitch: false })).toBe(true);
  });

  it("keeps the chat unavailable for any non-runnable safety state", () => {
    expect(isBotChatAvailable({ runMode: "OFF", lifeStatus: "ACTIVE", status: "PAUSED", killSwitch: true })).toBe(false);
    expect(isBotChatAvailable({ runMode: "PAPER_ACTIVE", lifeStatus: "DEAD", status: "RUNNING", killSwitch: false })).toBe(false);
    expect(isBotChatAvailable({ runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", status: "RUNNING", killSwitch: true })).toBe(false);
  });
});
