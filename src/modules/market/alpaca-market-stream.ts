import { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { shouldAcceptBar } from "@/modules/market/market-data-policy";

export type StreamCredentials = { apiKey: string; apiSecret: string };
type StreamFeed = "iex" | "sip";
type StreamSocket = { send(data: string): void; close(): void; on(event: string, listener: (...args: any[]) => void): unknown };

export type ParsedMarketMessage =
  | { type: "success"; message: string }
  | { type: "error"; code?: number; message: string }
  | { type: "subscription" }
  | { type: "bar"; symbol: string; timestamp: Date; open: string; high: string; low: string; close: string; volume: string; tradeCount?: number; vwap?: string }
  | { type: "quote"; symbol: string; timestamp: Date; bid: string; ask: string };

type StreamDependencies = {
  credentials: StreamCredentials;
  feed: StreamFeed;
  symbols: readonly string[];
  socketFactory?: (url: string) => StreamSocket | Promise<StreamSocket>;
  persist?: (messages: ParsedMarketMessage[]) => Promise<void>;
  scheduleReconnect?: (callback: () => void | Promise<void>, delayMs: number) => NodeJS.Timeout;
  clearReconnect?: (timeout: NodeJS.Timeout) => void;
};

const eventType = (message: ParsedMarketMessage) => {
  if (message.type === "bar") return "BAR";
  if (message.type === "quote") return "QUOTE";
  if (message.type === "success") return "STREAM_SUCCESS";
  if (message.type === "error") return "STREAM_ERROR";
  return "STREAM_SUBSCRIPTION";
};

const messageSymbol = (message: ParsedMarketMessage) => "symbol" in message ? message.symbol : null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsedTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Alpaca sends batches of tagged JSON events over the shared market-data socket. */
export function parseAlpacaMarketMessages(input: string): ParsedMarketMessage[] {
  let payload: unknown;
  try { payload = JSON.parse(input); }
  catch { return []; }
  if (!Array.isArray(payload)) return [];
  const messages: ParsedMarketMessage[] = [];
  for (const item of payload) {
    const record = asObject(item);
    if (!record || typeof record.T !== "string") continue;
    if (record.T === "success" && typeof record.msg === "string") messages.push({ type: "success", message: record.msg });
    else if (record.T === "error" && typeof record.msg === "string") messages.push({ type: "error", code: typeof record.code === "number" ? record.code : undefined, message: record.msg });
    else if (record.T === "subscription") messages.push({ type: "subscription" });
    else if (record.T === "b" && typeof record.S === "string") {
      const timestamp = parsedTimestamp(record.t);
      if (timestamp && isFiniteNumber(record.o) && isFiniteNumber(record.h) && isFiniteNumber(record.l) && isFiniteNumber(record.c) && isFiniteNumber(record.v)) {
        messages.push({ type: "bar", symbol: record.S, timestamp, open: String(record.o), high: String(record.h), low: String(record.l), close: String(record.c), volume: String(record.v), tradeCount: typeof record.n === "number" ? record.n : undefined, vwap: isFiniteNumber(record.vw) ? String(record.vw) : undefined });
      }
    } else if (record.T === "q" && typeof record.S === "string") {
      const timestamp = parsedTimestamp(record.t);
      if (timestamp && isFiniteNumber(record.bp) && isFiniteNumber(record.ap)) messages.push({ type: "quote", symbol: record.S, timestamp, bid: String(record.bp), ask: String(record.ap) });
    }
  }
  return messages;
}

/** Exponential backoff with bounded jitter prevents reconnect storms after a provider outage. */
export function streamReconnectDelay(attempt: number, random = Math.random) {
  const base = Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
  return Math.min(30_000, Math.round(base * (1 + random() * 0.2)));
}

export function alpacaMarketStreamUrl(feed: StreamFeed) {
  return `wss://stream.data.alpaca.markets/v2/${feed}`;
}

export async function persistAlpacaMarketStreamMessages(messages: ParsedMarketMessage[], feed: StreamFeed, db: PrismaClient = prisma) {
  if (!messages.length) return;
  await db.marketStreamEvent.createMany({
    data: messages.map((message) => ({ symbol: messageSymbol(message), eventType: eventType(message), provider: "alpaca-market-data", payload: JSON.parse(JSON.stringify(message)) })),
  });
  const bars = messages.filter((message): message is Extract<ParsedMarketMessage, { type: "bar" }> => message.type === "bar" && shouldAcceptBar(message.timestamp));
  if (bars.length) {
    await db.marketBar.createMany({
      data: bars.map((bar) => ({ symbol: bar.symbol, timeframe: "1Min", timestamp: bar.timestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, tradeCount: bar.tradeCount, vwap: bar.vwap, feed })),
      skipDuplicates: true,
    });
  }
}

async function defaultSocketFactory(url: string): Promise<StreamSocket> {
  const { default: WebSocket } = await import("ws");
  return new WebSocket(url) as unknown as StreamSocket;
}

/**
 * One worker-owned market socket. It only persists immutable market facts; the
 * existing minute cycle remains the idempotent decision/execution boundary.
 */
export class AlpacaMarketStreamManager {
  private socket: StreamSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopped = true;
  private authenticated = false;
  private symbols: string[];
  private readonly socketFactory: (url: string) => StreamSocket | Promise<StreamSocket>;
  private readonly persist: (messages: ParsedMarketMessage[]) => Promise<void>;
  private readonly scheduleReconnect: (callback: () => void | Promise<void>, delayMs: number) => NodeJS.Timeout;
  private readonly clearReconnect: (timeout: NodeJS.Timeout) => void;

  constructor(private readonly dependencies: StreamDependencies) {
    this.symbols = [...new Set(dependencies.symbols)];
    this.socketFactory = dependencies.socketFactory ?? defaultSocketFactory;
    this.persist = dependencies.persist ?? ((messages) => persistAlpacaMarketStreamMessages(messages, dependencies.feed));
    this.scheduleReconnect = dependencies.scheduleReconnect ?? ((callback, delayMs) => setTimeout(() => void callback(), delayMs));
    this.clearReconnect = dependencies.clearReconnect ?? clearTimeout;
  }

  async start() {
    if (!this.stopped) return;
    this.stopped = false;
    await this.connect();
  }

  stop() {
    this.stopped = true;
    this.authenticated = false;
    if (this.reconnectTimer) this.clearReconnect(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  /** Updates the shared stream from the union of enabled bot watchlists. */
  replaceSymbols(nextSymbols: readonly string[]) {
    const next = [...new Set(nextSymbols)];
    const removed = this.symbols.filter((symbol) => !next.includes(symbol));
    const added = next.filter((symbol) => !this.symbols.includes(symbol));
    this.symbols = next;
    if (!this.authenticated || !this.socket) return;
    if (removed.length) this.socket.send(JSON.stringify({ action: "unsubscribe", bars: removed, quotes: removed }));
    if (added.length) this.socket.send(JSON.stringify({ action: "subscribe", bars: added, quotes: added }));
  }

  /** Persisted separately so the web process can report stream freshness. */
  async recordHeartbeat() {
    if (!this.authenticated || this.stopped) return false;
    await this.persist([{ type: "success", message: "heartbeat" }]);
    return true;
  }

  private async connect() {
    if (this.stopped) return;
    try {
      const socket = await this.socketFactory(alpacaMarketStreamUrl(this.dependencies.feed));
      if (this.stopped) { socket.close(); return; }
      this.socket = socket;
      this.authenticated = false;
      socket.on("open", () => socket.send(JSON.stringify({ action: "auth", key: this.dependencies.credentials.apiKey, secret: this.dependencies.credentials.apiSecret })));
      socket.on("message", (data: Buffer | string) => void this.onMessage(Buffer.isBuffer(data) ? data.toString("utf8") : String(data)));
      socket.on("error", (error: Error) => logger.warn({ err: error }, "Alpaca market stream socket error"));
      socket.on("close", (code: number) => this.onClose(code));
    } catch (error) {
      logger.warn({ err: error }, "Alpaca market stream connection failed");
      this.scheduleNextReconnect();
    }
  }

  private async onMessage(data: string) {
    const messages = parseAlpacaMarketMessages(data);
    if (!messages.length) return;
    for (const message of messages) {
      if (message.type === "success" && message.message === "authenticated") {
        this.authenticated = true;
        this.reconnectAttempt = 0;
        this.socket?.send(JSON.stringify({ action: "subscribe", bars: this.symbols, quotes: this.symbols }));
      }
      if (message.type === "error") logger.warn({ code: message.code, message: message.message }, "Alpaca market stream provider error");
    }
    try { await this.persist(messages); }
    catch (error) { logger.error({ err: error }, "Unable to persist Alpaca market stream event"); }
  }

  private onClose(code: number) {
    this.socket = null;
    this.authenticated = false;
    if (!this.stopped) {
      logger.warn({ code }, "Alpaca market stream disconnected; reconnecting");
      this.scheduleNextReconnect();
    }
  }

  private scheduleNextReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = streamReconnectDelay(this.reconnectAttempt++);
    this.reconnectTimer = this.scheduleReconnect(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, delay);
  }
}
