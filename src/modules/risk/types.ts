import type { BotStatus, BrokerAccount, BrokerPosition, TradeProposalInput } from "@/modules/domain/contracts";

export type RiskPolicy = {
  maxPositionSize: string;
  maxPortfolioExposure: string;
  maxDailyLoss: string;
  maxWeeklyLoss: string;
  maxTradesPerDay: number;
  allowMargin: boolean;
  allowShorting: boolean;
  allowOptions: boolean;
  allowLeverage: boolean;
  marketOrderBufferPct: string;
};

export type RiskContext = {
  botStatus: BotStatus;
  killSwitch: boolean;
  marketOpen: boolean;
  dataFresh: boolean;
  accountHealthy: boolean;
  account: BrokerAccount;
  positions: BrokerPosition[];
  pendingSymbols: string[];
  dailyPnl: string;
  weeklyPnl: string;
  tradesToday: number;
  botCapitalAvailable: string;
};

export type RiskCheck = { rule: string; passed: boolean; detail: string };
export type RiskDecision = { approved: boolean; reason: string; checks: RiskCheck[]; approvedOrder?: TradeProposalInput };

export const DEFAULT_RISK_POLICY: RiskPolicy = {
  maxPositionSize: "10",
  maxPortfolioExposure: "50",
  maxDailyLoss: "3",
  maxWeeklyLoss: "10",
  maxTradesPerDay: 5,
  allowMargin: false,
  allowShorting: false,
  allowOptions: false,
  allowLeverage: false,
  marketOrderBufferPct: "0.02"
};
