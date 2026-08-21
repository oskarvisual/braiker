import { describe, expect, it } from "vitest";
import { resolveBotPowerChange } from "@/modules/bots/control";

describe("bot power control", () => {
  it("turns a bot on by clearing the kill switch and using the active mode", () => {
    expect(resolveBotPowerChange("TURN_ON")).toEqual({ runMode: "PAPER_ACTIVE", killSwitch: false });
  });

  it("turns a bot off by setting the kill switch before pausing it", () => {
    expect(resolveBotPowerChange("TURN_OFF")).toEqual({ runMode: "OFF", killSwitch: true });
  });
});
