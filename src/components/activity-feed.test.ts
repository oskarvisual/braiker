import { describe, expect, it } from "vitest";
import { filterActivityOrders, type HistoryOrder } from "./activity-feed";

describe("activity wallet filter", () => {
  it("keeps only the selected wallet's bot and external orders", () => {
    const orders: HistoryOrder[] = [
      { id: "bob-order", proposalId: "proposal-bob", walletId: "wallet-b", botId: "bob", botName: "Bob trAIder", symbol: "AAPL", side: "SELL", orderType: "MARKET", quantity: "1", filledQuantity: "1", averagePrice: "312.74", brokerStatus: "FILLED", historyState: "CLOSED", submittedAt: "2026-08-24T14:28:00.000Z", source: "BRAIKER" },
      { id: "jack-order", proposalId: "proposal-jack", walletId: "wallet-a", botId: "jack", botName: "Jack", symbol: "QQQ", side: "BUY", orderType: "MARKET", quantity: "1", filledQuantity: "1", averagePrice: "705.00", brokerStatus: "FILLED", historyState: "CLOSED", submittedAt: "2026-08-24T14:29:00.000Z", source: "BRAIKER" },
      { id: "external-order", proposalId: null, walletId: "wallet-b", botId: null, botName: null, symbol: "SPY", side: "SELL", orderType: "MARKET", quantity: "1", filledQuantity: "1", averagePrice: "700.00", brokerStatus: "FILLED", historyState: "CLOSED", submittedAt: "2026-08-24T14:30:00.000Z", source: "ALPACA" }
    ];

    expect(filterActivityOrders(orders, { walletId: "wallet-b", botId: "ALL", state: "ALL", query: "" }).map((order) => order.id)).toEqual(["bob-order", "external-order"]);
  });
});
