import { describe, expect, it } from "vitest";
import { botCapitalBreakdown } from "./dashboard-metrics";

describe("bot capital breakdown", () => {
  it("distinguishes allocated bot capital from capital still available in a wallet", () => {
    expect(botCapitalBreakdown("100", "0")).toEqual({ allocated: "100", available: "0" });
  });
});
