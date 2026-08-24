import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), findBot: vi.fn(), rename: vi.fn(), archive: vi.fn(), assertSameOrigin: vi.fn() }));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/modules/bot-chat/bot-chat-service", () => ({ renameBotChatSession: mocks.rename, archiveBotChatSession: mocks.archive }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/lib/prisma", () => ({ prisma: { botInstance: { findUnique: mocks.findBot } } }));

describe("PATCH /api/bots/[botId]/chat/sessions/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "operator-1", role: "OPERATOR" });
    mocks.findBot.mockResolvedValue({ id: "bot-1", wallet: { members: [{ userId: "operator-1" }] } });
  });

  it("renames a session only after wallet authorization", async () => {
    mocks.rename.mockResolvedValue({ id: "session-1", title: "QQQ analysis", archivedAt: null });
    const route = await import("./route");
    const response = await route.PATCH(new Request("http://localhost/api/bots/bot-1/chat/sessions/session-1", { method: "PATCH", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ action: "RENAME", title: "QQQ analysis" }) }), { params: Promise.resolve({ botId: "bot-1", sessionId: "session-1" }) });

    expect(mocks.rename).toHaveBeenCalledWith({ userId: "operator-1", botId: "bot-1", sessionId: "session-1", title: "QQQ analysis" }, expect.anything());
    await expect(response.json()).resolves.toEqual({ session: { id: "session-1", title: "QQQ analysis", archivedAt: null } });
  });

  it("does not update a chat session outside the user's wallet", async () => {
    mocks.findBot.mockResolvedValue({ id: "bot-1", wallet: { members: [] } });
    const route = await import("./route");
    const response = await route.PATCH(new Request("http://localhost/api/bots/bot-1/chat/sessions/session-1", { method: "PATCH", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ action: "ARCHIVE" }) }), { params: Promise.resolve({ botId: "bot-1", sessionId: "session-1" }) });

    expect(response.status).toBe(404);
    expect(mocks.archive).not.toHaveBeenCalled();
  });
});
