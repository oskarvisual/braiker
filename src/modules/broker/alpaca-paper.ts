import { env } from "@/lib/env";
import type { ApprovedOrder, BrokerAccount, BrokerAdapter, BrokerClock, BrokerOrder, BrokerPortfolioPoint, BrokerPosition } from "@/modules/domain/contracts";

type Credentials = { apiKey: string; apiSecret: string };
type AlpacaOrderPayload = {
  id: string;
  client_order_id: string;
  status: string;
  symbol?: string;
  side?: string;
  type?: string;
  qty?: string;
  filled_qty?: string;
  filled_avg_price?: string | null;
  submitted_at?: string;
  filled_at?: string | null;
};

export class AlpacaPaperBrokerAdapter implements BrokerAdapter {
  readonly environment = "paper" as const;
  private readonly baseUrl: string;

  constructor(private readonly credentials: Credentials) {
    const config = env();
    if (config.TRADING_MODE !== "paper" || config.ALPACA_PAPER_BASE_URL !== "https://paper-api.alpaca.markets") throw new Error("LIVE_TRADING_IS_NOT_SUPPORTED");
    this.baseUrl = config.ALPACA_PAPER_BASE_URL;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "APCA-API-KEY-ID": this.credentials.apiKey, "APCA-API-SECRET-KEY": this.credentials.apiSecret, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(10_000)
    });
    if (response.status === 404) throw new Error("NOT_FOUND");
    if (!response.ok) throw new Error(`ALPACA_${response.status}`);
    return response.json() as Promise<T>;
  }

  async getAccount(): Promise<BrokerAccount> {
    const account = await this.request<{ buying_power: string; cash: string; equity: string; trading_blocked: boolean }>("/v2/account");
    return { buyingPower: account.buying_power, cash: account.cash, equity: account.equity, tradingBlocked: account.trading_blocked };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const positions = await this.request<Array<{ symbol: string; qty: string; market_value: string; avg_entry_price: string }>>("/v2/positions");
    return positions.map((position) => ({ symbol: position.symbol, quantity: position.qty, marketValue: position.market_value, averageEntryPrice: position.avg_entry_price }));
  }

  async getOrders(): Promise<BrokerOrder[]> {
    const orders = await this.request<AlpacaOrderPayload[]>("/v2/orders?status=all&direction=desc&limit=100");
    return orders.map((order) => ({ id: order.id, clientOrderId: order.client_order_id, status: order.status, raw: order }));
  }

  async getPortfolioHistory(): Promise<BrokerPortfolioPoint[]> {
    const history = await this.request<{ timestamp: number[]; equity: Array<string | null> }>("/v2/account/portfolio/history?period=1W&timeframe=1D");
    return history.timestamp.flatMap((timestamp, index) => {
      const equity = history.equity[index];
      return equity === null || equity === undefined ? [] : [{ capturedAt: new Date(timestamp * 1_000), equity }];
    });
  }

  async getClock(): Promise<BrokerClock> {
    const clock = await this.request<{ is_open: boolean; timestamp: string; next_open: string; next_close: string }>("/v2/clock");
    return { isOpen: clock.is_open, timestamp: new Date(clock.timestamp), nextOpen: new Date(clock.next_open), nextClose: new Date(clock.next_close) };
  }

  async getOrderByClientOrderId(clientOrderId: string): Promise<BrokerOrder | null> {
    try {
      const order = await this.request<AlpacaOrderPayload>(`/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`);
      return { id: order.id, clientOrderId: order.client_order_id, status: order.status, raw: order };
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") return null;
      throw error;
    }
  }

  async placeOrder(order: ApprovedOrder): Promise<BrokerOrder> {
    const payload = { symbol: order.symbol, qty: order.quantity, side: order.action.toLowerCase(), type: order.orderType.toLowerCase(), time_in_force: "day", client_order_id: order.clientOrderId, ...(order.orderType === "LIMIT" ? { limit_price: order.limitPrice } : {}) };
    const created = await this.request<AlpacaOrderPayload>("/v2/orders", { method: "POST", body: JSON.stringify(payload) });
    return { id: created.id, clientOrderId: created.client_order_id, status: created.status, raw: created };
  }

  async cancelOrder(orderId: string): Promise<void> { await this.request(`/v2/orders/${orderId}`, { method: "DELETE" }); }
  async healthCheck() { try { await this.getAccount(); return { healthy: true }; } catch (error) { return { healthy: false, detail: error instanceof Error ? error.message : "unknown" }; } }
}
