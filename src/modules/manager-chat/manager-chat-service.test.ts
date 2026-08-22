import { describe, expect, it, vi } from "vitest";
import { appendManagerAlert, createManagerConversation, ensureOperationsSession, sendManagerMessage } from "./manager-chat-service";

describe("Bot Manager chat service", () => {
  it("creates exactly one pinned Operations session for a user", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "operations", title: "Bot Manager · Operations", pinned: true });
    const db = {
      managerChatSession: { upsert }
    } as never;

    await ensureOperationsSession("11111111-1111-4111-8111-111111111111", db);

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { externalKey: "operations:11111111-1111-4111-8111-111111111111" },
      create: expect.objectContaining({ kind: "OPERATIONS", pinned: true, title: "Bot Manager · Operations" })
    }));
  });

  it("recovers the existing Operations session when concurrent creation loses the unique-key race", async () => {
    const existing = { id: "operations-existing", title: "Bot Manager · Operations", pinned: true };
    const upsert = vi.fn().mockRejectedValue({ code: "P2002" });
    const findUnique = vi.fn().mockResolvedValue(existing);
    const db = { managerChatSession: { upsert, findUnique } } as never;

    await expect(ensureOperationsSession("11111111-1111-4111-8111-111111111111", db)).resolves.toEqual(existing);
    expect(findUnique).toHaveBeenCalledWith({ where: { externalKey: "operations:11111111-1111-4111-8111-111111111111" } });
  });

  it("creates ordinary sessions unpinned and trims their title", async () => {
    const create = vi.fn().mockResolvedValue({ id: "manual" });
    const db = { managerChatSession: { create } } as never;
    await createManagerConversation("11111111-1111-4111-8111-111111111111", "  Research plan  ", db);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "CONVERSATION", pinned: false, title: "Research plan" }) });
  });

  it("stores a redacted alert once, even when alert delivery retries", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "operations" });
    const store = vi.fn().mockResolvedValue({ id: "alert" });
    const db = {
      managerChatSession: { upsert },
      managerChatMessage: { upsert: store }
    } as never;

    await appendManagerAlert({ userId: "11111111-1111-4111-8111-111111111111", alertId: "alert-1", subject: "Worker stale", message: "Token 123456789:abcdefghijklmnopqrstuvwxyz_123456" }, db);

    expect(store).toHaveBeenCalledWith(expect.objectContaining({
      where: { sourceReference: "telegram-alert:alert-1" },
      create: expect.objectContaining({ role: "SYSTEM", source: "TELEGRAM_ALERT", content: expect.not.stringContaining("123456789") })
    }));
  });

  it("prepares a named power proposal before asking the conversational model", async () => {
    const create = vi.fn().mockResolvedValue({ id: "proposal-1", expiresAt: new Date("2026-08-22T15:10:00.000Z") });
    const responder = { reply: vi.fn() };
    const db = {
      managerChatSession: { findFirst: vi.fn().mockResolvedValue({ id: "operations" }) },
      managerChatMessage: { create: vi.fn().mockResolvedValue({}) },
      botInstance: { findMany: vi.fn().mockResolvedValue([{ id: "bot-1", name: "Juan trAIder" }]) },
      managerActionProposal: { create }
    } as never;

    const result = await sendManagerMessage({
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "operations",
      content: "activate bot Juan trAIder",
      actorRole: "ADMIN",
      requestedVia: "WEB"
    }, { db, responder, aiEnabled: false });

    expect(result).toEqual(expect.objectContaining({ available: true, actionProposal: expect.objectContaining({ id: "proposal-1", botName: "Juan trAIder", action: "TURN_ON" }) }));
    expect(responder.reply).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ botId: "bot-1", action: "TURN_ON" }) }));
  });

  it("creates a local visible bot-note session from either Manager channel without calling the model", async () => {
    const responder = { reply: vi.fn() };
    const db = {
      managerChatSession: { findFirst: vi.fn().mockResolvedValue({ id: "operations" }) },
      managerChatMessage: { create: vi.fn().mockResolvedValue({}) },
      botInstance: {
        findMany: vi.fn().mockResolvedValue([{ id: "bot-1", name: "Juan trAIder" }]),
        findUnique: vi.fn().mockResolvedValue({ id: "bot-1", runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", status: "RUNNING", killSwitch: false })
      },
      managerActionProposal: { create: vi.fn() },
      botChatSession: { create: vi.fn().mockResolvedValue({ id: "note-session" }) },
      botChatMessage: { create: vi.fn().mockResolvedValue({ id: "note-message" }) },
      botDailyContext: { create: vi.fn() }
    };

    const result = await sendManagerMessage({ userId: "11111111-1111-4111-8111-111111111111", sessionId: "operations", content: "Note for Juan trAIder: avoid new QQQ exposure before CPI", actorRole: "ADMIN", requestedVia: "TELEGRAM" }, { db: db as never, responder, aiEnabled: false });

    expect(result.reply).toContain("local bot-chat session");
    expect(responder.reply).not.toHaveBeenCalled();
    expect(db.botChatSession.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ botId: "bot-1", kind: "MANAGER_NOTE" }) }));
    expect(db.botDailyContext.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ source: "MANAGER_NOTE" }) }));
  });

  it("does not call the provider while the global AI circuit is quota-disabled", async () => {
    const responder = { reply: vi.fn() };
    const db = {
      managerChatSession: { findFirst: vi.fn().mockResolvedValue({ id: "conversation" }) },
      managerChatMessage: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
      aiRuntimeState: { findUnique: vi.fn().mockResolvedValue({ status: "QUOTA_EXHAUSTED", disabledAt: new Date(), lastCheckedAt: new Date() }) }
    } as never;

    const result = await sendManagerMessage({ userId: "11111111-1111-4111-8111-111111111111", sessionId: "conversation", content: "Explain the last scan" }, { db, responder, aiEnabled: true });

    expect(responder.reply).not.toHaveBeenCalled();
    expect(result.reply).toContain("paused");
  });

  it("does not ask the provider twice when a Telegram update is replayed", async () => {
    const responder = { reply: vi.fn() };
    const db = {
      managerChatSession: { findFirst: vi.fn().mockResolvedValue({ id: "operations" }) },
      managerChatMessage: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn()
          .mockResolvedValueOnce({ content: "Explain the last scan" })
          .mockResolvedValueOnce({ content: "The scan was skipped because the market was closed." })
      },
      aiRuntimeState: { findUnique: vi.fn() }
    } as never;

    const result = await sendManagerMessage({
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "operations",
      content: "Explain the last scan",
      source: "TELEGRAM",
      sourceReference: "telegram:4242"
    }, { db, responder, aiEnabled: true });

    expect(responder.reply).not.toHaveBeenCalled();
    expect(result).toEqual({ reply: "The scan was skipped because the market was closed.", available: true });
  });

  it("resumes a replayed Telegram update after a prior provider failure without duplicating the user message", async () => {
    const create = vi.fn().mockResolvedValue({});
    const responder = { reply: vi.fn().mockResolvedValue("The market is closed, so no order was placed.") };
    const db = {
      managerChatSession: { findFirst: vi.fn().mockResolvedValue({ id: "operations" }) },
      managerChatMessage: {
        create,
        findMany: vi.fn().mockResolvedValue([{ role: "USER", content: "Why did the scan skip?" }]),
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: "existing-user-message" })
          .mockResolvedValueOnce(null)
      },
      aiRuntimeState: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE", disabledAt: null, lastCheckedAt: new Date() }) },
      botInstance: { findMany: vi.fn().mockResolvedValue([]) },
      botScanRun: { findMany: vi.fn() },
      tradeProposal: { groupBy: vi.fn() }
    } as never;

    await sendManagerMessage({
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "operations",
      content: "Why did the scan skip?",
      source: "TELEGRAM",
      sourceReference: "telegram:retry-after-provider-failure"
    }, { db, responder, aiEnabled: true });

    expect(responder.reply).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "ASSISTANT", sourceReference: "reply:telegram:retry-after-provider-failure" }) }));
  });
});
