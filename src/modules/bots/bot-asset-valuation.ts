import { Prisma } from "@prisma/client";

type BotPositionInput = { botId: string; symbol: string; quantity: string; averageEntryPrice: string };
type GlobalPositionInput = { symbol: string; quantity: string; marketValue: string; updatedAt: string };
type BotAssetValue = { value: string | null; valuedAt: string | null; unpricedSymbols: string[] };

function stringify(value: Prisma.Decimal) { return value.toString(); }

/** Uses only persisted Alpaca reconciliation values; entry prices are display-only. */
export function valueBotAssets(input: { positions: BotPositionInput[]; globalPositions: GlobalPositionInput[] }) {
  const market = new Map(input.globalPositions.filter((position) => new Prisma.Decimal(position.quantity).gt(0)).map((position) => [position.symbol, position]));
  const byBotRows = new Map<string, Array<{ value: Prisma.Decimal; symbol: string; valuedAt: string }>>();
  const unpricedByBot = new Map<string, string[]>();
  const allocation = new Map<string, { value: Prisma.Decimal; valuedAt: string }>();
  for (const position of input.positions) {
    if (!new Prisma.Decimal(position.quantity).gt(0)) continue;
    const global = market.get(position.symbol);
    if (!global) { unpricedByBot.set(position.botId, [...(unpricedByBot.get(position.botId) ?? []), position.symbol]); continue; }
    const impliedPrice = new Prisma.Decimal(global.marketValue).div(global.quantity);
    const value = new Prisma.Decimal(position.quantity).mul(impliedPrice);
    byBotRows.set(position.botId, [...(byBotRows.get(position.botId) ?? []), { value, symbol: position.symbol, valuedAt: global.updatedAt }]);
    const current = allocation.get(position.symbol);
    allocation.set(position.symbol, { value: (current?.value ?? new Prisma.Decimal(0)).plus(value), valuedAt: current && current.valuedAt < global.updatedAt ? current.valuedAt : global.updatedAt });
  }
  const botIds = new Set(input.positions.map((position) => position.botId));
  const byBot: Record<string, BotAssetValue> = {};
  for (const botId of botIds) {
    const rows = byBotRows.get(botId) ?? [];
    const unpricedSymbols = [...new Set(unpricedByBot.get(botId) ?? [])].sort();
    byBot[botId] = unpricedSymbols.length ? { value: null, valuedAt: null, unpricedSymbols } : { value: stringify(rows.reduce((total, row) => total.plus(row.value), new Prisma.Decimal(0))), valuedAt: rows.reduce<string | null>((earliest, row) => !earliest || row.valuedAt < earliest ? row.valuedAt : earliest, null), unpricedSymbols: [] };
  }
  const unpricedSymbols = [...new Set([...unpricedByBot.values()].flat())].sort();
  const rows = [...allocation.entries()].map(([symbol, item]) => ({ symbol, value: stringify(item.value), valuedAt: item.valuedAt })).sort((left, right) => new Prisma.Decimal(right.value).cmp(new Prisma.Decimal(left.value)));
  return { byBot, allocation: unpricedSymbols.length ? [] : rows, totalValue: unpricedSymbols.length ? null : stringify(rows.reduce((total, item) => total.plus(item.value), new Prisma.Decimal(0))), valuedAt: unpricedSymbols.length ? null : rows.reduce<string | null>((earliest, row) => !earliest || row.valuedAt < earliest ? row.valuedAt : earliest, null), unpricedSymbols };
}

export function valueBotPositionRows(input: { positions: Array<Omit<BotPositionInput, "botId">>; globalPositions: GlobalPositionInput[] }) {
  const market = new Map(input.globalPositions.filter((position) => new Prisma.Decimal(position.quantity).gt(0)).map((position) => [position.symbol, position]));
  return input.positions.filter((position) => new Prisma.Decimal(position.quantity).gt(0)).map((position) => {
    const global = market.get(position.symbol);
    if (!global) return { ...position, marketPrice: null, marketValue: null, valuedAt: null };
    const marketPrice = new Prisma.Decimal(global.marketValue).div(global.quantity);
    return { ...position, marketPrice: stringify(marketPrice), marketValue: stringify(new Prisma.Decimal(position.quantity).mul(marketPrice)), valuedAt: global.updatedAt };
  }).sort((left, right) => left.symbol.localeCompare(right.symbol));
}
