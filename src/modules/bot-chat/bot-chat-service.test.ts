import { describe, expect, it, vi } from "vitest";
import { createOrLoadBotChat, sendBotChatMessage } from "./bot-chat-service";

describe("isolated bot chats", () => {
  it("uses a session unique to the requesting user and bot", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "chat-1" });
    await createOrLoadBotChat("user-1", "bot-1", { botChatSession: { upsert } } as never);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { botId_userId: { botId: "bot-1", userId: "user-1" } } }));
  });

  it("persists a contextual reply without providing any action authority", async () => {
    const responder = { reply: vi.fn().mockResolvedValue("The risk check rejected the QQQ candidate.") };
    const db = {
      botChatSession: { upsert: vi.fn().mockResolvedValue({ id: "chat-1" }) },
      botChatMessage: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      botInstance: { findUnique: vi.fn().mockResolvedValue({ id: "bot-1", name: "Juan", runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", currentCapital: { toString: () => "10" }, reservedCapital: { toString: () => "0" }, watchlist: [], dailyInputs: [], scanRuns: [], proposals: [] }) }
    };

    const result = await sendBotChatMessage({ userId: "user-1", botId: "bot-1", content: "Why did you reject QQQ?" }, { db: db as never, responder, aiEnabled: true });

    expect(result.reply).toContain("risk check");
    expect(responder.reply).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ bot: expect.objectContaining({ name: "Juan" }) }) }));
    expect(db.botChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "USER" }) }));
  });
});
