import { describe, expect, it } from "vitest";
import { canSubmitWithKillSwitch } from "@/modules/execution/kill-switch-gate";

describe("canSubmitWithKillSwitch", () => {
  it("rejects a claimed execution when the persistent kill switch is on", () => {
    expect(canSubmitWithKillSwitch({ killSwitch: true, status: "RUNNING", riskApproved: true })).toEqual({ allowed: false, reason: "KILL_SWITCH" });
  });

  it("rejects paused bots and proposals that are not risk approved", () => {
    expect(canSubmitWithKillSwitch({ killSwitch: false, status: "PAUSED", riskApproved: true })).toEqual({ allowed: false, reason: "BOT_NOT_RUNNING" });
    expect(canSubmitWithKillSwitch({ killSwitch: false, status: "RUNNING", riskApproved: false })).toEqual({ allowed: false, reason: "RISK_NOT_APPROVED" });
  });
});
