import type { RiskPolicy } from "@/modules/risk/types";
import type { BotLifeStatus, BotStatus } from "@prisma/client";

export const ALLOWED_TRADING_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA", "XLK", "AAPL", "MSFT", "NVDA", "AMZN", "TSLA"] as const;
export type AllowedTradingSymbol = typeof ALLOWED_TRADING_SYMBOLS[number];
export type BotTemplateId = "GUARDIAN" | "NAVIGATOR" | "EXPLORER";
export type BotRunMode = "OFF" | "PAPER_ACTIVE";

type BotTemplate = { id: BotTemplateId; name: string; description: string; avatar: string; riskPolicy: RiskPolicy };

const neverTradeRisk = { allowMargin: false, allowShorting: false, allowOptions: false, allowLeverage: false, marketOrderBufferPct: "0.02" } as const;

const templates: BotTemplate[] = [
  { id: "GUARDIAN", name: "Guardian", description: "Conservative: fewer trades, lower exposure, stronger confirmation.", avatar: "shield", riskPolicy: { maxPositionSize: "5", maxPortfolioExposure: "20", maxDailyLoss: "1", maxWeeklyLoss: "3", maxTradesPerDay: 2, ...neverTradeRisk } },
  { id: "NAVIGATOR", name: "Navigator", description: "Balanced: measured opportunities with moderate exposure.", avatar: "compass", riskPolicy: { maxPositionSize: "10", maxPortfolioExposure: "35", maxDailyLoss: "2", maxWeeklyLoss: "6", maxTradesPerDay: 4, ...neverTradeRisk } },
  { id: "EXPLORER", name: "Explorer", description: "Dynamic: more candidate signals, within strict paper-only limits.", avatar: "spark", riskPolicy: { maxPositionSize: "15", maxPortfolioExposure: "50", maxDailyLoss: "3", maxWeeklyLoss: "10", maxTradesPerDay: 6, ...neverTradeRisk } }
];

export function listBotTemplates() { return templates; }

export function getBotTemplate(id: BotTemplateId) {
  const template = templates.find((candidate) => candidate.id === id);
  if (!template) throw new Error("UNKNOWN_BOT_TEMPLATE");
  return template;
}

export function isAllowedTradingSymbol(symbol: string): symbol is AllowedTradingSymbol {
  return (ALLOWED_TRADING_SYMBOLS as readonly string[]).includes(symbol);
}

export function validateBotModeChange(input: { nextMode: BotRunMode; killSwitch: boolean; status?: BotStatus; lifeStatus?: BotLifeStatus }) {
  if (input.nextMode !== "OFF" && input.lifeStatus === "DEAD") return "BOT_DEAD";
  if (input.nextMode !== "OFF" && input.status === "RISK_HALTED") return "BOT_RISK_HALTED";
  if (input.nextMode !== "OFF" && input.status === "ERROR") return "BOT_ERROR";
  if (input.nextMode !== "OFF" && input.status === "MAINTENANCE") return "BOT_MAINTENANCE";
  if (input.nextMode === "PAPER_ACTIVE" && input.killSwitch) return "KILL_SWITCH_ENABLED";
  return null;
}

export function shouldQueuePaperExecution(mode: string, riskApproved: boolean) {
  return mode === "PAPER_ACTIVE" && riskApproved;
}
