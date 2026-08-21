import { isAllowedTradingSymbol } from "@/modules/bots/bot-templates";

const EQUITY_SYMBOL = /^[A-Z][A-Z.-]{0,14}$/;

export function normalizeEquitySymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (symbol.includes("/") || symbol.includes("-USD") || symbol.includes("USDT")) throw new Error("EQUITIES_ETFS_ONLY");
  if (!EQUITY_SYMBOL.test(symbol)) throw new Error("INVALID_EQUITY_SYMBOL");
  if (!isAllowedTradingSymbol(symbol)) throw new Error("SYMBOL_NOT_IN_INITIAL_UNIVERSE");
  return symbol;
}
