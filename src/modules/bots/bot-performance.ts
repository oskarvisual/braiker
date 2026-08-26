import { Prisma } from "@prisma/client";

type CapitalEvent = { kind: string; amount: string };
type OpenPosition = { quantity: string; averageEntryPrice: string };

export type BotPerformance = {
  startingCapital: string;
  netContributions: string;
  liquidCapital: string;
  assets: string | null;
  equity: string | null;
  realizedPnl: string;
  unrealizedPnl: string | null;
  tradingPnl: string | null;
  operatingCosts: string;
};

const zero = new Prisma.Decimal(0);
const externalCapitalKinds = new Set(["ALLOCATION", "TOP_UP", "WITHDRAWAL"]);

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

/**
 * Calculates a bot's return independently of money moved into or out of its
 * virtual allocation. Broker fill events are deliberately excluded because
 * they move value between liquid cash and attributed positions.
 */
export function calculateBotPerformance(input: {
  initialCapital: string;
  currentCapital: string;
  assetValue: string | null;
  positions: OpenPosition[];
  capitalEvents: CapitalEvent[];
  realizedPnl: string;
  operatingCosts: string;
}): BotPerformance {
  const allocation = input.capitalEvents.find((event) => event.kind === "ALLOCATION");
  const externalFlows = input.capitalEvents
    .filter((event) => externalCapitalKinds.has(event.kind))
    .reduce((total, event) => total.plus(decimal(event.amount)), zero);
  // Older bots can predate the immutable allocation event. `initialCapital`
  // includes TOP_UPs, so remove those before using it as the original funding.
  const topUps = input.capitalEvents.filter((event) => event.kind === "TOP_UP").reduce((total, event) => total.plus(decimal(event.amount)), zero);
  const legacyStartingCapital = decimal(input.initialCapital).minus(topUps);
  const startingCapital = allocation ? decimal(allocation.amount) : Prisma.Decimal.max(zero, legacyStartingCapital);
  const netContributions = allocation ? externalFlows : externalFlows.plus(startingCapital);
  const liquidCapital = decimal(input.currentCapital);
  const realizedPnl = decimal(input.realizedPnl);
  const operatingCosts = decimal(input.operatingCosts);

  if (input.assetValue === null) {
    return {
      startingCapital: startingCapital.toString(),
      netContributions: netContributions.toString(),
      liquidCapital: liquidCapital.toString(),
      assets: null,
      equity: null,
      realizedPnl: realizedPnl.toString(),
      unrealizedPnl: null,
      tradingPnl: null,
      operatingCosts: operatingCosts.toString()
    };
  }

  const assets = decimal(input.assetValue);
  const openCostBasis = input.positions.reduce((total, position) => total.plus(decimal(position.quantity).mul(decimal(position.averageEntryPrice))), zero);
  const equity = liquidCapital.plus(assets);
  return {
    startingCapital: startingCapital.toString(),
    netContributions: netContributions.toString(),
    liquidCapital: liquidCapital.toString(),
    assets: assets.toString(),
    equity: equity.toString(),
    realizedPnl: realizedPnl.toString(),
    unrealizedPnl: assets.minus(openCostBasis).toString(),
    // Costs are restored solely for this calculation so transfers and virtual
    // operating expenses never appear as investment return.
    tradingPnl: equity.minus(netContributions).plus(operatingCosts).toString(),
    operatingCosts: operatingCosts.toString()
  };
}
