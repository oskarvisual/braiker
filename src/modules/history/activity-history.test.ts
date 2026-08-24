import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { listActivityHistory } from "./activity-history";

describe("activity history", () => {
  it("includes internal orders and bot filters from every wallet available to an Admin", async () => {
    const db = {
      wallet: {
        findMany: vi.fn().mockResolvedValue([
          { id: "wallet-a", name: "Core wallet", bots: [{ id: "jack", name: "Jack" }] },
          { id: "wallet-b", name: "Experiments", bots: [{ id: "bob", name: "Bob trAIder" }] }
        ])
      },
      tradeProposal: {
        findMany: vi.fn().mockResolvedValue([{ id: "proposal-bob", bot: { id: "bob", name: "Bob trAIder", walletId: "wallet-b" } }])
      },
      order: {
        findMany: vi.fn().mockResolvedValue([{
          id: "order-bob", proposalId: "proposal-bob", brokerOrderId: "alpaca-bob", clientOrderId: "braiker-bob", symbol: "AAPL", action: "SELL", orderType: "MARKET", quantity: new Prisma.Decimal("1"), status: "FILLED", createdAt: new Date("2026-08-24T14:28:00.000Z"), fills: [{ quantity: new Prisma.Decimal("1"), price: new Prisma.Decimal("312.74") }]
        }])
      },
      brokerOrderSnapshot: { findMany: vi.fn().mockResolvedValue([]) }
    };

    const history = await listActivityHistory({ userId: "admin-1", role: "ADMIN" }, db as never);

    expect(history.hasWallets).toBe(true);
    expect(db.tradeProposal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { bot: { walletId: { in: ["wallet-a", "wallet-b"] } } } }));
    expect(history.wallets).toEqual([{ id: "wallet-a", name: "Core wallet" }, { id: "wallet-b", name: "Experiments" }]);
    expect(history.bots).toEqual([{ id: "jack", name: "Jack", walletId: "wallet-a" }, { id: "bob", name: "Bob trAIder", walletId: "wallet-b" }]);
    expect(history.orders).toEqual([expect.objectContaining({ walletId: "wallet-b", botId: "bob", botName: "Bob trAIder", symbol: "AAPL" })]);
  });
});
