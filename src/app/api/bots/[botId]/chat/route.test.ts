import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findBot: vi.fn(),
  findSessions: vi.fn(),
  findMessages: vi.fn()
}));

vi.mock("@/lib/http", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { botInstance: { findUnique: mocks.findBot }, botChatSession: { findMany: mocks.findSessions }, botChatMessage: { findMany: mocks.findMessages } } }));
vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/modules/manager-chat/manager-chat", () => ({ resolveManagerChatModel: vi.fn() }));
vi.mock("@/modules/manager-chat/openai-manager-chat", () => ({ OpenAiManagerChat: class {} }));
vi.mock("@/modules/bot-chat/bot-chat-service", () => ({ createBotChatSession: vi.fn(), sendBotChatMessage: vi.fn() }));
vi.mock("@/modules/bot-chat/availability", () => ({ isBotChatAvailable: vi.fn().mockReturnValue(true) }));

describe("GET /api/bots/[botId]/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.findBot.mockResolvedValueOnce({ id: "bot-1", wallet: { members: [] } }).mockResolvedValueOnce({ runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", status: "RUNNING", killSwitch: false });
    mocks.findSessions.mockResolvedValue([{ id: "session-1", title: "Review", kind: "CONVERSATION", createdAt: new Date("2026-08-22T14:00:00.000Z"), updatedAt: new Date("2026-08-22T15:01:00.000Z") }]);
    mocks.findMessages.mockResolvedValue([
      { id: "new", role: "ASSISTANT", content: "Latest", createdAt: new Date("2026-08-22T15:01:00.000Z") },
      { id: "old", role: "USER", content: "Earlier", createdAt: new Date("2026-08-22T15:00:00.000Z") }
    ]);
  });

  it("loads the one hundred newest messages and returns them in chronological order", async () => {
    const route = await import("./route");

    const response = await route.GET(new Request("http://localhost/api/bots/bot-1/chat"), { params: Promise.resolve({ botId: "bot-1" }) });

    expect(mocks.findMessages).toHaveBeenCalledWith({ where: { sessionId: "session-1" }, orderBy: { createdAt: "desc" }, take: 100 });
    await expect(response.json()).resolves.toMatchObject({ messages: [{ id: "old" }, { id: "new" }] });
  });
});
