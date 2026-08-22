import { describe, expect, it, vi } from "vitest";
import { createBotChatSession, sendBotChatMessage } from "./bot-chat-service";

describe("isolated bot chats", () => {
  it("creates separate, user-owned sessions for the same bot", async () => {
    const create = vi.fn().mockResolvedValue({ id: "chat-1" });
    await createBotChatSession({ userId: "user-1", botId: "bot-1", title: "QQQ review" }, { botChatSession: { create }, botInstance: { findUnique: vi.fn().mockResolvedValue({ id: "bot-1", runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", status: "RUNNING", killSwitch: false }) } } as never);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "user-1", botId: "bot-1", title: "QQQ review", kind: "CONVERSATION" }) });
  });

  it("rejects a message when the bot is not actively running", async () => {
    const db = {
      botInstance: { findUnique: vi.fn().mockResolvedValue({ id: "bot-1", runMode: "OFF", lifeStatus: "ACTIVE", status: "PAUSED", killSwitch: true }) }
    };

    await expect(sendBotChatMessage({ userId: "user-1", botId: "bot-1", sessionId: "chat-1", content: "Important: avoid QQQ today" }, { db: db as never, responder: { reply: vi.fn() }, aiEnabled: true })).rejects.toThrow("BOT_CHAT_REQUIRES_ACTIVE_BOT");
  });

  it("does not create a new session while the bot is off", async () => {
    const db = { botChatSession: { create: vi.fn() }, botInstance: { findUnique: vi.fn().mockResolvedValue({ id: "bot-1", runMode: "OFF", lifeStatus: "ACTIVE", status: "PAUSED", killSwitch: true }) } };
    await expect(createBotChatSession({ userId: "user-1", botId: "bot-1" }, db as never)).rejects.toThrow("BOT_CHAT_REQUIRES_ACTIVE_BOT");
    expect(db.botChatSession.create).not.toHaveBeenCalled();
  });

  it("persists an explicitly important message as cautious context for today without action authority", async () => {
    const responder = { reply: vi.fn().mockResolvedValue("The risk check rejected the QQQ candidate.") };
    const db = {
      botChatSession: { findFirst: vi.fn().mockResolvedValue({ id: "chat-1" }) },
      botChatMessage: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      botDailyContext: { create: vi.fn() },
      botInstance: { findUnique: vi.fn()
        .mockResolvedValueOnce({ id: "bot-1", runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", status: "RUNNING", killSwitch: false })
        .mockResolvedValueOnce({ id: "bot-1", name: "Juan", runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", currentCapital: { toString: () => "10" }, reservedCapital: { toString: () => "0" }, watchlist: [], dailyInputs: [], dailyContexts: [], scanRuns: [], proposals: [] }) }
    };
    db.botChatMessage.create.mockResolvedValueOnce({ id: "message-1" });

    const result = await sendBotChatMessage({ userId: "user-1", botId: "bot-1", sessionId: "chat-1", content: "Important: avoid QQQ today" }, { db: db as never, responder, aiEnabled: true });

    expect(result.reply).toContain("risk check");
    expect(result.addedToDailyContext).toBe(true);
    expect(responder.reply).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ bot: expect.objectContaining({ name: "Juan" }) }) }));
    expect(db.botChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "USER" }) }));
    expect(db.botDailyContext.create).toHaveBeenCalledWith({ data: expect.objectContaining({ botId: "bot-1", userId: "user-1", messageId: "message-1", source: "USER_CHAT" }) });
  });

  it("passes the exact selected operation to the responder instead of relying on recent history", async () => {
    const responder = { reply: vi.fn().mockResolvedValue("The QQQ order was rejected by its recorded risk check.") };
    const db = {
      botChatSession: { findFirst: vi.fn().mockResolvedValue({ id: "chat-1" }) },
      botChatMessage: { create: vi.fn().mockResolvedValue({ id: "message-1" }), findMany: vi.fn().mockResolvedValue([]) },
      botDailyContext: { create: vi.fn() },
      order: { findUnique: vi.fn().mockResolvedValue({ id: "order-1", proposalId: "proposal-1", symbol: "QQQ", action: "BUY", orderType: "MARKET", quantity: { toString: () => "1" }, status: "REJECTED", createdAt: new Date("2026-08-22T14:00:00.000Z"), fills: [] }) },
      tradeProposal: { findUnique: vi.fn().mockResolvedValue({ botId: "bot-1", status: "RISK_REJECTED", estimatedPrice: { toString: () => "700" }, riskDecision: { approved: false, reason: "DAILY_LOSS_LIMIT", checks: [] } }) },
      botScanRun: { findFirst: vi.fn() },
      botInstance: { findUnique: vi.fn()
        .mockResolvedValueOnce({ id: "bot-1", runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", status: "RUNNING", killSwitch: false })
        .mockResolvedValueOnce({ id: "bot-1", name: "Juan", runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", currentCapital: { toString: () => "10" }, reservedCapital: { toString: () => "0" }, watchlist: [], dailyInputs: [], dailyContexts: [], scanRuns: [], proposals: [] }) }
    };

    await sendBotChatMessage({ userId: "user-1", botId: "bot-1", sessionId: "chat-1", content: "Explain this operation.", focus: { kind: "ORDER", id: "order-1" } }, { db: db as never, responder, aiEnabled: true });

    expect(responder.reply).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ focus: expect.objectContaining({ type: "operation", orderId: "order-1", riskReason: "DAILY_LOSS_LIMIT" }) }) }));
  });
});
