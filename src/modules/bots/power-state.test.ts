import { describe, expect, it } from "vitest";
import { botPowerState } from "./power-state";

describe("bot power state", () => {
  it("labels paper-active bots as ON and every non-active mode as OFF", () => {
    expect(botPowerState("PAPER_ACTIVE")).toEqual({ label: "ON", tone: "on" });
    expect(botPowerState("OFF")).toEqual({ label: "OFF", tone: "off" });
    expect(botPowerState("SIMULATION")).toEqual({ label: "OFF", tone: "off" });
  });
});
