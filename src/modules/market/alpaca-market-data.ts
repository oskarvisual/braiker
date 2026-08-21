import { env } from "@/lib/env";
import type { Quote } from "@/modules/domain/contracts";

const DATA_URL = "https://data.alpaca.markets";

export type PersistableMarketBar = {
  symbol: string;
  timeframe: "1Min";
  timestamp: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  tradeCount?: number;
  vwap?: string;
  feed: string;
};

type Credentials = { apiKey: string; apiSecret: string };
type AlpacaBarPayload = { t: string; o: number; h: number; l: number; c: number; v: number; n?: number; vw?: number };
type AlpacaQuotePayload = { t: string; bp: number; ap: number };

const value = (input: number) => String(input);

export function parseAlpacaBars(symbol: string, payload: { bars?: AlpacaBarPayload[] }, feed: string): PersistableMarketBar[] {
  return (payload.bars ?? []).map((bar) => ({ symbol, timeframe: "1Min", timestamp: new Date(bar.t), open: value(bar.o), high: value(bar.h), low: value(bar.l), close: value(bar.c), volume: value(bar.v), tradeCount: bar.n, vwap: bar.vw === undefined ? undefined : value(bar.vw), feed }));
}

export function parseAlpacaQuote(symbol: string, payload: { quote?: AlpacaQuotePayload }, feed: string): Quote {
  if (!payload.quote) throw new Error("ALPACA_MARKET_QUOTE_MISSING");
  return { symbol, bid: value(payload.quote.bp), ask: value(payload.quote.ap), timestamp: new Date(payload.quote.t), feed };
}

export class AlpacaMarketDataAdapter {
  private readonly feed: "iex" | "sip";

  constructor(private readonly credentials: Credentials) {
    const config = env();
    if (config.TRADING_MODE !== "paper" || config.ALPACA_PAPER_BASE_URL !== "https://paper-api.alpaca.markets") throw new Error("LIVE_TRADING_IS_NOT_SUPPORTED");
    this.feed = config.ALPACA_DATA_FEED;
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${DATA_URL}${path}`, {
      headers: { "APCA-API-KEY-ID": this.credentials.apiKey, "APCA-API-SECRET-KEY": this.credentials.apiSecret },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`ALPACA_MARKET_${response.status}`);
    return response.json() as Promise<T>;
  }

  async getMinuteBars(symbol: string, start: Date, end = new Date()): Promise<PersistableMarketBar[]> {
    const query = new URLSearchParams({ timeframe: "1Min", start: start.toISOString(), end: end.toISOString(), feed: this.feed, adjustment: "raw", limit: "10000" });
    const payload = await this.request<{ bars?: AlpacaBarPayload[] }>(`/v2/stocks/${encodeURIComponent(symbol)}/bars?${query}`);
    return parseAlpacaBars(symbol, payload, this.feed);
  }

  async getLatestQuote(symbol: string): Promise<Quote> {
    const query = new URLSearchParams({ feed: this.feed });
    const payload = await this.request<{ quote?: AlpacaQuotePayload }>(`/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest?${query}`);
    return parseAlpacaQuote(symbol, payload, this.feed);
  }
}
