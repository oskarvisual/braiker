import { describe, expect, it, vi } from "vitest";
import { AlpacaMarketStreamManager, parseAlpacaMarketMessages, streamReconnectDelay } from "@/modules/market/alpaca-market-stream";

class FakeSocket {
  sent: string[] = [];
  private listeners = new Map<string, Array<(...args: any[]) => void>>();
  send(message: string) { this.sent.push(message); }
  close() { this.emit("close", 1000, "closed"); }
  on(event: string, listener: (...args: any[]) => void) { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); return this; }
  emit(event: string, ...args: any[]) { for (const listener of this.listeners.get(event) ?? []) listener(...args); }
}

describe("Alpaca market stream protocol", () => {
  it("parses only valid bar and quote events from Alpaca batches", () => {
    expect(parseAlpacaMarketMessages(JSON.stringify([
      { T: "success", msg: "authenticated" },
      { T: "b", S: "SPY", o: 600, h: 601, l: 599, c: 600.5, v: 10, t: "2026-08-21T14:30:00Z", n: 3, vw: 600.2 },
      { T: "q", S: "SPY", bp: 600, ap: 600.1, t: "2026-08-21T14:30:04Z" },
      { T: "b", S: "SPY", c: "invalid" }
    ]))).toEqual([
      { type: "success", message: "authenticated" },
      { type: "bar", symbol: "SPY", timestamp: new Date("2026-08-21T14:30:00.000Z"), open: "600", high: "601", low: "599", close: "600.5", volume: "10", tradeCount: 3, vwap: "600.2" },
      { type: "quote", symbol: "SPY", timestamp: new Date("2026-08-21T14:30:04.000Z"), bid: "600", ask: "600.1" }
    ]);
  });

  it("caps reconnect delay and does not create a tight reconnect loop", () => {
    expect(streamReconnectDelay(0, () => 0)).toBe(1_000);
    expect(streamReconnectDelay(2, () => 0)).toBe(4_000);
    expect(streamReconnectDelay(20, () => 0)).toBe(30_000);
  });

  it("authenticates once, subscribes after authentication, persists events, and reconnects after a close", async () => {
    const sockets: FakeSocket[] = [];
    const persist = vi.fn().mockResolvedValue(undefined);
    const schedule = vi.fn();
    const manager = new AlpacaMarketStreamManager({
      credentials: { apiKey: "paper-key", apiSecret: "paper-secret" },
      feed: "iex",
      symbols: ["SPY", "QQQ"],
      socketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
      persist,
      scheduleReconnect: (callback, delay) => { schedule(callback, delay); return 1 as unknown as NodeJS.Timeout; },
      clearReconnect: () => undefined
    });

    await manager.start();
    sockets[0].emit("open");
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ action: "auth", key: "paper-key", secret: "paper-secret" });
    sockets[0].emit("message", Buffer.from(JSON.stringify([{ T: "success", msg: "authenticated" }])));
    expect(JSON.parse(sockets[0].sent[1])).toEqual({ action: "subscribe", bars: ["SPY", "QQQ"], quotes: ["SPY", "QQQ"] });

    sockets[0].emit("message", Buffer.from(JSON.stringify([{ T: "b", S: "SPY", o: 600, h: 601, l: 599, c: 600.5, v: 10, t: "2026-08-21T14:30:00Z" }])));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: "bar", symbol: "SPY" })])));
    sockets[0].emit("close", 1006, "network");
    expect(schedule).toHaveBeenCalledOnce();
    await schedule.mock.calls[0][0]();
    expect(sockets).toHaveLength(2);
    manager.stop();
  });

  it("records a durable health heartbeat only after authentication", async () => {
    const socket = new FakeSocket();
    const persist = vi.fn().mockResolvedValue(undefined);
    const manager = new AlpacaMarketStreamManager({ credentials: { apiKey: "paper-key", apiSecret: "paper-secret" }, feed: "iex", symbols: ["SPY"], socketFactory: () => socket, persist });
    await manager.start();
    expect(await manager.recordHeartbeat()).toBe(false);
    socket.emit("message", Buffer.from(JSON.stringify([{ T: "success", msg: "authenticated" }])));
    expect(await manager.recordHeartbeat()).toBe(true);
    expect(persist).toHaveBeenLastCalledWith([{ type: "success", message: "heartbeat" }]);
    manager.stop();
  });
});
