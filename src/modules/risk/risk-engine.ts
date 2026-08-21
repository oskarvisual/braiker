import { Prisma } from "@prisma/client";
import type { TradeProposalInput } from "@/modules/domain/contracts";
import type { RiskCheck, RiskContext, RiskDecision, RiskPolicy } from "@/modules/risk/types";

const money = (value: string) => new Prisma.Decimal(value);
const decimal = (value: Prisma.Decimal) => value.toDecimalPlaces(12).toString();

export function assessRisk(proposal: TradeProposalInput, context: RiskContext, policy: RiskPolicy): RiskDecision {
  const checks: RiskCheck[] = [];
  const check = (rule: string, passed: boolean, detail: string) => checks.push({ rule, passed, detail });

  check("KILL_SWITCH", !context.killSwitch, context.killSwitch ? "Trading is explicitly stopped" : "Execution enabled");
  check("BOT_STATE", context.botStatus === "RUNNING", `Bot status is ${context.botStatus}`);
  check("MARKET_OPEN", context.marketOpen, context.marketOpen ? "Regular market session" : "Market is closed");
  check("FRESH_MARKET_DATA", context.dataFresh, context.dataFresh ? "Market data is fresh" : "Market data is stale");
  check("BROKER_HEALTH", context.accountHealthy && !context.account.tradingBlocked, "Broker account is available for trading");
  check("ORDER_QUANTITY", money(proposal.quantity).gt(0), "Quantity must be positive");
  check("ORDER_PRICE", money(proposal.estimatedPrice).gt(0), "Estimated price must be positive");
  check("LIMIT_PRICE", proposal.orderType !== "LIMIT" || (proposal.limitPrice !== undefined && money(proposal.limitPrice).gt(0)), "Limit orders require a positive limit price");
  check("NO_SHORTING", policy.allowShorting || proposal.action !== "SELL" || context.positions.some((position) => position.symbol === proposal.symbol && money(position.quantity).gte(money(proposal.quantity))), "Sell cannot open a short position");
  check("NO_DUPLICATE_ORDER", !context.pendingSymbols.includes(proposal.symbol), "No pending order for this symbol");
  check("MAX_TRADES_PER_DAY", context.tradesToday < policy.maxTradesPerDay, `Trades today: ${context.tradesToday}/${policy.maxTradesPerDay}`);
  check("MAX_DAILY_LOSS", money(context.dailyPnl).gt(money(policy.maxDailyLoss).negated()), `Daily P&L: ${context.dailyPnl}`);
  check("MAX_WEEKLY_LOSS", money(context.weeklyPnl).gt(money(policy.maxWeeklyLoss).negated()), `Weekly P&L: ${context.weeklyPnl}`);

  const effectivePrice = proposal.orderType === "MARKET"
    ? money(proposal.estimatedPrice).mul(new Prisma.Decimal(1).plus(money(policy.marketOrderBufferPct)))
    : money(proposal.limitPrice ?? "0");
  const requestedValue = money(proposal.quantity).mul(effectivePrice);
  const currentExposure = context.positions.reduce((sum, position) => sum.plus(money(position.marketValue).abs()), new Prisma.Decimal(0));
  const existingPosition = context.positions.find((position) => position.symbol === proposal.symbol);
  const projectedPosition = proposal.action === "BUY"
    ? (existingPosition ? money(existingPosition.marketValue).abs() : new Prisma.Decimal(0)).plus(requestedValue)
    : Prisma.Decimal.max(new Prisma.Decimal(0), (existingPosition ? money(existingPosition.marketValue).abs() : new Prisma.Decimal(0)).minus(requestedValue));
  const projectedExposure = proposal.action === "BUY" ? currentExposure.plus(requestedValue) : Prisma.Decimal.max(new Prisma.Decimal(0), currentExposure.minus(requestedValue));

  check("MAX_POSITION_SIZE", projectedPosition.lte(money(policy.maxPositionSize)), `Projected position value: ${decimal(projectedPosition)}`);
  check("MAX_PORTFOLIO_EXPOSURE", projectedExposure.lte(money(policy.maxPortfolioExposure)), `Projected exposure: ${decimal(projectedExposure)}`);
  check("BOT_BUDGET_AVAILABLE", proposal.action !== "BUY" || requestedValue.lte(money(context.botCapitalAvailable)), `Bot capital available: ${context.botCapitalAvailable}`);
  check("AVAILABLE_CASH", proposal.action !== "BUY" || requestedValue.lte(money(context.account.cash)), `Required cash: ${decimal(requestedValue)}`);

  const failed = checks.find((item) => !item.passed);
  return failed ? { approved: false, reason: failed.rule, checks } : { approved: true, reason: "APPROVED", checks, approvedOrder: proposal };
}
