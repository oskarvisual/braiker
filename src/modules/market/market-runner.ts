import { Prisma, TradeAction } from "@prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { globalPaperBroker, globalPaperCredentials } from "@/modules/broker/global-paper";
import { syncGlobalPaperAccount } from "@/modules/broker/paper-sync";
import { getBotTemplate } from "@/modules/bots/bot-templates";
import { recordProposedTrade } from "@/modules/decision/decision-service";
import type { MarketBar } from "@/modules/domain/contracts";
import { AlpacaMarketDataAdapter, type PersistableMarketBar } from "@/modules/market/alpaca-market-data";
import { buildIndicatorSet, classifyMarketRegime, marketTrend } from "@/modules/market/market-context";
import { marketEvaluationKey, shouldAcceptBar } from "@/modules/market/market-data-policy";
import type { RiskPolicy } from "@/modules/risk/types";
import { sizePosition } from "@/modules/strategy/position-sizing";
import { evaluateTrendStrategy, type StrategyProfile } from "@/modules/strategy/trend-strategy";
import { realizedPnlWindows } from "@/modules/risk/realized-pnl";

const TIMEFRAME = "1Min";
const BAR_HISTORY = 60;
const STALE_AFTER_MS = 2 * 60_000;

type ActiveBot = Awaited<ReturnType<typeof activeBots>>[number];

function domainBar(bar: { symbol: string; timeframe: string; timestamp: Date; open: Prisma.Decimal; high: Prisma.Decimal; low: Prisma.Decimal; close: Prisma.Decimal; volume: Prisma.Decimal; feed: string }): MarketBar {
  return { symbol: bar.symbol, timeframe: bar.timeframe, timestamp: bar.timestamp, open: bar.open.toString(), high: bar.high.toString(), low: bar.low.toString(), close: bar.close.toString(), volume: bar.volume.toString(), feed: bar.feed };
}

async function activeBots() {
  return prisma.botInstance.findMany({
    where: { runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", status: "RUNNING", killSwitch: false },
    include: { watchlist: { where: { enabled: true } }, botPositions: true }
  });
}

async function loadBars(symbol: string, feed: string) {
  const stored = await prisma.marketBar.findMany({ where: { symbol, timeframe: TIMEFRAME, feed }, orderBy: { timestamp: "desc" }, take: BAR_HISTORY });
  return stored.reverse().map(domainBar);
}

function strategyProfile(bot: ActiveBot): StrategyProfile {
  const template = getBotTemplate(bot.templateId as "GUARDIAN" | "NAVIGATOR" | "EXPLORER");
  const persisted = bot.strategyProfile as Partial<StrategyProfile>;
  return { id: template.id, ...template.strategyProfile, ...persisted };
}

function riskPolicy(bot: ActiveBot): RiskPolicy {
  return bot.riskPolicy as unknown as RiskPolicy;
}

async function persistBars(bars: PersistableMarketBar[]) {
  const closed = bars.filter((bar) => shouldAcceptBar(bar.timestamp));
  if (!closed.length) return 0;
  const result = await prisma.marketBar.createMany({ data: closed.map((bar) => ({ ...bar, tradeCount: bar.tradeCount, vwap: bar.vwap })), skipDuplicates: true });
  return result.count;
}

async function backfill(adapter: AlpacaMarketDataAdapter, symbol: string, feed: string) {
  const latest = await prisma.marketBar.findFirst({ where: { symbol, timeframe: TIMEFRAME, feed }, orderBy: { timestamp: "desc" }, select: { timestamp: true } });
  const start = latest ? new Date(latest.timestamp.getTime() + 60_000) : new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const bars = await adapter.getMinuteBars(symbol, start);
  return persistBars(bars);
}

async function evaluateBotForBar(input: { bot: ActiveBot; symbol: string; candle: MarketBar; quote: { bid: string; ask: string; timestamp: Date; feed: string }; marketBars: Map<string, MarketBar[]>; marketOpen: boolean; account: { cash: string; equity: string } }) {
  const evaluationKey = marketEvaluationKey({ botId: input.bot.id, symbol: input.symbol, timeframe: TIMEFRAME, timestamp: input.candle.timestamp });
  try {
    await prisma.marketEvaluation.create({ data: { evaluationKey, botId: input.bot.id, symbol: input.symbol, timeframe: TIMEFRAME, candleTimestamp: input.candle.timestamp } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    throw error;
  }

  try {
    const bars = input.marketBars.get(input.symbol) ?? [];
    const spyBars = input.marketBars.get("SPY") ?? [];
    const qqqBars = input.marketBars.get("QQQ") ?? [];
    const indicators = buildIndicatorSet(bars);
    const spyIndicators = buildIndicatorSet(spyBars);
    const qqqIndicators = buildIndicatorSet(qqqBars);
    const spyClose = Number(spyBars.at(-1)?.close ?? "0");
    const qqqClose = Number(qqqBars.at(-1)?.close ?? "0");
    const regime = classifyMarketRegime({ ...spyIndicators, close: spyClose }, { ...qqqIndicators, close: qqqClose });
    const position = input.bot.botPositions.find((item) => item.symbol === input.symbol && item.quantity.gt(0));
    const context = {
      symbol: input.symbol,
      timestamp: input.candle.timestamp,
      price: input.candle.close,
      quote: input.quote,
      candle: input.candle,
      indicators,
      market: { spyTrend: marketTrend(spyIndicators, spyClose), qqqTrend: marketTrend(qqqIndicators, qqqClose), regime },
      portfolio: { virtualCash: input.bot.currentCapital.toString(), reservedCapital: input.bot.reservedCapital.toString(), positions: input.bot.botPositions.map((item) => ({ symbol: item.symbol, quantity: item.quantity.toString(), averageEntryPrice: item.averageEntryPrice.toString() })) },
      bot: { id: input.bot.id, templateId: input.bot.templateId, capitalAllocation: input.bot.currentCapital.toString() }
    };
    const snapshot = await prisma.marketSnapshot.create({ data: { botId: input.bot.id, symbol: input.symbol, payload: context as Prisma.InputJsonValue } });
    const signal = evaluateTrendStrategy({ symbol: input.symbol, timestamp: input.candle.timestamp, price: input.candle.close, indicators, market: context.market, hasPosition: Boolean(position), profile: strategyProfile(input.bot) });
    const signalRecord = await prisma.strategySignal.create({ data: { botId: input.bot.id, snapshotId: snapshot.id, symbol: input.symbol, action: signal.action, confidence: signal.confidence, reason: signal.reason, payload: signal.payload as Prisma.InputJsonValue } });
    if (signal.action === "HOLD") {
      await prisma.marketEvaluation.update({ where: { evaluationKey }, data: { status: "HOLD", completedAt: new Date() } });
      return "hold";
    }
    const dataFresh = Date.now() - input.candle.timestamp.getTime() <= STALE_AFTER_MS && Date.now() - input.quote.timestamp.getTime() <= STALE_AFTER_MS;
    const policy = riskPolicy(input.bot);
    const positionExposure = input.bot.botPositions.reduce((total, item) => total.plus(item.quantity.mul(item.averageEntryPrice)), new Prisma.Decimal(0));
    const proposal = signal.action === "SELL" && position
      ? { symbol: input.symbol, action: "SELL" as const, orderType: "MARKET" as const, quantity: position.quantity.toString(), estimatedPrice: input.quote.bid }
      : (() => {
          const sized = sizePosition({ price: input.quote.ask, confidence: signal.confidence, availableCapital: input.bot.currentCapital.minus(input.bot.reservedCapital).toString(), currentExposure: positionExposure.toString(), maxPositionSize: policy.maxPositionSize, maxPortfolioExposure: policy.maxPortfolioExposure });
          return sized ? { symbol: input.symbol, action: "BUY" as const, orderType: "MARKET" as const, quantity: sized.quantity, estimatedPrice: input.quote.ask } : null;
        })();
    if (!proposal) {
      await prisma.marketEvaluation.update({ where: { evaluationKey }, data: { status: "NO_CAPITAL", completedAt: new Date() } });
      return "no-capital";
    }
    const pending = await prisma.tradeProposal.findMany({ where: { botId: input.bot.id, symbol: input.symbol, status: { in: ["RISK_APPROVED", "SUBMITTED"] } }, select: { symbol: true } });
    const tradesToday = await prisma.tradeProposal.count({ where: { botId: input.bot.id, action: { not: TradeAction.HOLD }, createdAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } } });
    const pnl = await realizedPnlWindows(prisma.fill, input.bot.id);
    const result = await recordProposedTrade({
      botId: input.bot.id,
      signalId: signalRecord.id,
      proposal,
      marketContext: context,
      policy,
      riskContext: {
        botStatus: input.bot.status,
        killSwitch: input.bot.killSwitch,
        marketOpen: input.marketOpen,
        dataFresh,
        accountHealthy: true,
        account: { buyingPower: input.account.cash, cash: input.account.cash, equity: input.account.equity, tradingBlocked: false },
        positions: input.bot.botPositions.map((item) => ({ symbol: item.symbol, quantity: item.quantity.toString(), marketValue: item.quantity.mul(item.averageEntryPrice).toString(), averageEntryPrice: item.averageEntryPrice.toString() })),
        pendingSymbols: pending.map((item) => item.symbol),
        dailyPnl: pnl.dailyPnl,
        weeklyPnl: pnl.weeklyPnl,
        tradesToday,
        botCapitalAvailable: input.bot.currentCapital.minus(input.bot.reservedCapital).toString()
      }
    });
    await prisma.marketEvaluation.update({ where: { evaluationKey }, data: { status: result.decision.approved ? "RISK_APPROVED" : `RISK_${result.decision.reason}`, completedAt: new Date() } });
    await prisma.systemEvent.create({ data: { severity: result.decision.approved ? "INFO" : "WARN", source: "strategy-runner", message: result.decision.approved ? "Paper proposal approved" : "Paper proposal rejected", metadata: { botId: input.bot.id, symbol: input.symbol, signal: signal.action, proposalId: result.proposal.id, reason: result.decision.reason } } });
    return result.decision.approved ? "approved" : "rejected";
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await prisma.marketEvaluation.update({ where: { evaluationKey }, data: { status: "ERROR", completedAt: new Date() } });
    await prisma.errorEvent.create({ data: { source: "strategy-runner", message, metadata: { botId: input.bot.id, symbol: input.symbol, evaluationKey } } });
    throw error;
  }
}

/** Shared once-per-minute worker cycle. It never creates a scheduler task per bot. */
export async function processMarketCycle() {
  const bots = await activeBots();
  if (!bots.length) return { activeBots: 0, storedBars: 0, evaluations: 0 };
  let storedBars = 0;
  let evaluations = 0;
  const clock = await globalPaperBroker().getClock();
  if (!clock.isOpen) return { activeBots: bots.length, storedBars, evaluations };
  const sync = await syncGlobalPaperAccount();
  const market = new AlpacaMarketDataAdapter(globalPaperCredentials());
  const symbols = new Set(["SPY", "QQQ", ...bots.flatMap((bot: ActiveBot) => bot.watchlist.map((item) => item.symbol))]);
  const feed = env().ALPACA_DATA_FEED;
  for (const symbol of symbols) storedBars += await backfill(market, symbol, feed);
  const bars = new Map<string, MarketBar[]>();
  for (const symbol of symbols) bars.set(symbol, await loadBars(symbol, feed));
  const quotes = new Map<string, Awaited<ReturnType<typeof market.getLatestQuote>>>();
  for (const symbol of symbols) quotes.set(symbol, await market.getLatestQuote(symbol));
  for (const bot of bots) {
    for (const entry of bot.watchlist) {
      const candle = bars.get(entry.symbol)?.at(-1);
      const quote = quotes.get(entry.symbol);
      if (!candle || !quote) continue;
      const result = await evaluateBotForBar({ bot, symbol: entry.symbol, candle, quote, marketBars: bars, marketOpen: clock.isOpen, account: { cash: sync.cash, equity: sync.equity } });
      if (result !== "duplicate") evaluations += 1;
    }
  }
  logger.info({ activeBots: bots.length, storedBars, evaluations }, "Shared market cycle completed");
  return { activeBots: bots.length, storedBars, evaluations };
}
