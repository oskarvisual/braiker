import { describe, expect, it } from "vitest";
import { assessRisk } from "@/modules/risk/risk-engine";
import { DEFAULT_RISK_POLICY, type RiskContext } from "@/modules/risk/types";

const context: RiskContext = {
  botStatus: "RUNNING", killSwitch: false, marketOpen: true, dataFresh: true, accountHealthy: true,
  account: { buyingPower: "100", cash: "100", equity: "100", tradingBlocked: false }, positions: [], pendingSymbols: [], dailyPnl: "0", weeklyPnl: "0", tradesToday: 0, botCapitalAvailable: "100"
};
const proposal = { symbol: "NVDA", action: "BUY" as const, orderType: "MARKET" as const, quantity: "1", estimatedPrice: "5" };

describe("assessRisk", () => {
  it("approves a valid paper order", () => expect(assessRisk(proposal, context, DEFAULT_RISK_POLICY)).toMatchObject({ approved: true, reason: "APPROVED" }));
  it("always rejects when the kill switch is enabled", () => expect(assessRisk(proposal, { ...context, killSwitch: true }, DEFAULT_RISK_POLICY)).toMatchObject({ approved: false, reason: "KILL_SWITCH" }));
  it("rejects a position above the policy limit", () => expect(assessRisk({ ...proposal, estimatedPrice: "11" }, context, DEFAULT_RISK_POLICY)).toMatchObject({ approved: false, reason: "MAX_POSITION_SIZE" }));
  it("rejects an order that exceeds the bot's own isolated budget", () => expect(assessRisk(proposal, { ...context, botCapitalAvailable: "4" }, DEFAULT_RISK_POLICY)).toMatchObject({ approved: false, reason: "BOT_BUDGET_AVAILABLE" }));
});
