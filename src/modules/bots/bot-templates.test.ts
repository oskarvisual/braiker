import { describe, expect, it } from "vitest";
import { ALLOWED_TRADING_SYMBOLS, getBotTemplate, listBotTemplates, shouldQueuePaperExecution, validateBotModeChange } from "@/modules/bots/bot-templates";

describe("bot templates and operating modes", () => {
  it("offers exactly the three reviewed personalities with bounded risk policies", () => {
    expect(listBotTemplates().map((template) => template.id)).toEqual(["GUARDIAN", "NAVIGATOR", "EXPLORER"]);
    expect(getBotTemplate("GUARDIAN").riskPolicy.maxPositionSize).toBe("5");
    expect(getBotTemplate("NAVIGATOR").riskPolicy.maxPortfolioExposure).toBe("35");
    expect(getBotTemplate("EXPLORER").riskPolicy.maxTradesPerDay).toBe(6);
  });

  it("keeps the initial market universe fixed to ten liquid US symbols", () => {
    expect(ALLOWED_TRADING_SYMBOLS).toEqual(["SPY", "QQQ", "IWM", "DIA", "XLK", "AAPL", "MSFT", "NVDA", "AMZN", "TSLA"]);
  });

  it("blocks activation while the Kill Switch is on", () => {
    expect(validateBotModeChange({ nextMode: "PAPER_ACTIVE", killSwitch: true })).toBe("KILL_SWITCH_ENABLED");
  });

  it("allows multiple paper-active bots in the same wallet when their own safeguards pass", () => {
    expect(validateBotModeChange({ nextMode: "PAPER_ACTIVE", killSwitch: false })).toBeNull();
  });

  it("does not let normal mode controls bypass a critical bot halt", () => {
    expect(validateBotModeChange({ nextMode: "PAPER_ACTIVE", killSwitch: false, status: "RISK_HALTED" })).toBe("BOT_RISK_HALTED");
    expect(validateBotModeChange({ nextMode: "PAPER_ACTIVE", killSwitch: false, status: "ERROR" })).toBe("BOT_ERROR");
  });

  it("never reactivates a bot whose own capital is exhausted", () => {
    expect(validateBotModeChange({ nextMode: "PAPER_ACTIVE", killSwitch: false, lifeStatus: "DEAD" })).toBe("BOT_DEAD");
  });

  it("never queues an Alpaca order from an off bot", () => {
    expect(shouldQueuePaperExecution("OFF", true)).toBe(false);
    expect(shouldQueuePaperExecution("PAPER_ACTIVE", false)).toBe(false);
    expect(shouldQueuePaperExecution("PAPER_ACTIVE", true)).toBe(true);
  });
});
