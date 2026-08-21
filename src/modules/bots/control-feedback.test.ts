import { describe, expect, it } from "vitest";
import { botControlFeedback } from "@/modules/bots/control-feedback";

describe("bot control feedback", () => {
  it("keeps retired internal codes out of user-facing feedback", () => {
    expect(botControlFeedback("PAPER_BOT_ALREADY_ACTIVE", { requestedBotName: "Juan" })).toEqual({
      title: "We could not update this bot",
      message: "Please try again. If the problem continues, review the bot configuration."
    });
  });

  it("never exposes an internal error code to the user", () => {
    expect(botControlFeedback("BOT_RISK_HALTED", { requestedBotName: "Juan" })).toEqual({
      title: "Juan cannot be turned on",
      message: "This bot is halted by risk controls. Review it before trying again."
    });
  });

  it("explains when a wallet has no unallocated capital for a new bot", () => {
    expect(botControlFeedback("INSUFFICIENT_UNALLOCATED_CAPITAL", { requestedBotName: "New bot", walletName: "Alpaca Paper - Main", availableCapital: "0" })).toEqual({
      title: "No capital available",
      message: "Alpaca Paper - Main has $0.00 available. Turn off and delete an unused bot to return its budget, or add another wallet in Settings."
    });
  });
});
