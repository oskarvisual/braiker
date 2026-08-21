export type TradeAction = "BUY" | "SELL" | "HOLD";
export type OrderType = "MARKET" | "LIMIT";
export type BotStatus = "RUNNING" | "PAUSED" | "RISK_HALTED" | "ERROR" | "MAINTENANCE";

export type MarketBar = { symbol: string; timestamp: Date; open: string; high: string; low: string; close: string; volume: string; timeframe: string; feed: string };
export type Quote = { symbol: string; bid: string; ask: string; timestamp: Date; feed: string };
export type StrategySignal = { action: TradeAction; confidence: number; reason: string; payload: Record<string, unknown> };
export type TradeProposalInput = { symbol: string; action: Exclude<TradeAction, "HOLD">; orderType: OrderType; quantity: string; limitPrice?: string; estimatedPrice: string };
export type BrokerAccount = { buyingPower: string; cash: string; equity: string; tradingBlocked: boolean };
export type BrokerPosition = { symbol: string; quantity: string; marketValue: string; averageEntryPrice: string };
export type BrokerOrder = { id: string; clientOrderId: string; status: string; raw: Record<string, unknown> };
export type BrokerPortfolioPoint = { capturedAt: Date; equity: string };
export type BrokerClock = { isOpen: boolean; timestamp: Date; nextOpen: Date; nextClose: Date };
export type ApprovedOrder = TradeProposalInput & { clientOrderId: string };

export interface BrokerAdapter {
  readonly environment: "paper" | "live";
  getAccount(): Promise<BrokerAccount>;
  getPositions(): Promise<BrokerPosition[]>;
  getOrders(): Promise<BrokerOrder[]>;
  getOrderByClientOrderId(clientOrderId: string): Promise<BrokerOrder | null>;
  getPortfolioHistory(): Promise<BrokerPortfolioPoint[]>;
  getClock(): Promise<BrokerClock>;
  placeOrder(order: ApprovedOrder): Promise<BrokerOrder>;
  cancelOrder(orderId: string): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; detail?: string }>;
}

export interface MarketDataProvider {
  getBars(symbol: string, timeframe: string, limit: number): Promise<MarketBar[]>;
  getQuote(symbol: string): Promise<Quote>;
}

export interface AIProvider {
  analyze(input: { symbol: string; action: Exclude<TradeAction, "HOLD">; confidence: number; strategyReason: string; indicators: Record<string, number>; marketRegime: string }): Promise<{ recommendation: "PROCEED" | "CAUTION" | "REJECT"; rationale: string; risks: string[]; evidence: string[] }>;
}
