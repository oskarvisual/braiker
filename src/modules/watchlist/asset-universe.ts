export const DEFAULT_GLOBAL_TRADING_SYMBOLS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD"] as const;

type AlpacaAsset = { symbol: string; name?: string; class: string; exchange: string; status: string; tradable: boolean };
export type TradableUsEquity = { symbol: string; name: string; exchange: string };

const symbolPattern = /^[A-Z][A-Z.-]{0,14}$/;

export function normalizeUniverseSymbols(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter((symbol) => symbolPattern.test(symbol)))];
}

export function filterTradableUsEquities(assets: AlpacaAsset[]): TradableUsEquity[] {
  const selected = new Map<string, TradableUsEquity>();
  for (const asset of assets) {
    const [symbol] = normalizeUniverseSymbols([asset.symbol]);
    if (!symbol || asset.class !== "us_equity" || asset.status !== "active" || !asset.tradable || asset.exchange === "OTC") continue;
    selected.set(symbol, { symbol, name: asset.name?.trim() || symbol, exchange: asset.exchange });
  }
  return [...selected.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export async function assertGloballyEnabledSymbols(symbols: string[], db: { tradableAsset: { findMany: (args: any) => PromiseLike<Array<{ symbol: string }>> } }) {
  const normalized = normalizeUniverseSymbols(symbols);
  if (!normalized.length || normalized.length !== symbols.length) throw new Error("INVALID_EQUITY_SYMBOL");
  const enabled = await db.tradableAsset.findMany({ where: { symbol: { in: normalized }, enabled: true, active: true, tradable: true }, select: { symbol: true } });
  if (enabled.length !== normalized.length) throw new Error("SYMBOL_NOT_GLOBALLY_ENABLED");
  return normalized;
}
