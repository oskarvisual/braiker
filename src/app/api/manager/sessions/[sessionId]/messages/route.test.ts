import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  sendManagerMessage: vi.fn(),
  mirrorWebManagerExchangeToTelegram: vi.fn(),
  assertSameOrigin: vi.fn(),
  env: vi.fn()
}));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/modules/manager-chat/manager-chat-service", () => ({ sendManagerMessage: mocks.sendManagerMessage }));
vi.mock("@/modules/telegram/bot-manager", () => ({ mirrorWebManagerExchangeToTelegram: mocks.mirrorWebManagerExchangeToTelegram }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/modules/manager-chat/openai-manager-chat", () => ({ OpenAiManagerChat: class {} }));
vi.mock("@/modules/manager-chat/manager-chat", () => ({ resolveManagerChatModel: () => "test-model" }));

describe("POST /api/manager/sessions/[sessionId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.env.mockReturnValue({ OPENAI_API_KEY: "", OPENAI_MODEL: "test", BOT_MANAGER_CHAT_MODEL: "", OPENAI_TIMEOUT_MS: 1, AI_ENABLED: false });
    mocks.mirrorWebManagerExchangeToTelegram.mockResolvedValue({ mirrored: false });
  });

  it("passes a web message through the shared action resolver and returns a browser-safe confirmation proposal", async () => {
    mocks.sendManagerMessage.mockResolvedValue({
      reply: "Proposal prepared to turn ON Juan trAIder.",
      available: true,
      actionProposal: { id: "proposal-1", botName: "Juan trAIder", action: "TURN_ON", expiresAt: new Date("2026-08-22T15:10:00.000Z"), confirmationCode: "A1B2C3D4E5F6" }
    });
    const route = (await import("./route")) as { POST: (request: Request, context: { params: Promise<{ sessionId: string }> }) => Promise<Response> };

    const response = await route.POST(new Request("http://localhost/api/manager/sessions/session-1/messages", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ content: "activate bot Juan trAIder" }) }), { params: Promise.resolve({ sessionId: "session-1" }) });

    expect(mocks.sendManagerMessage).toHaveBeenCalledWith(expect.objectContaining({ userId: "admin-1", sessionId: "session-1", actorRole: "ADMIN", requestedVia: "WEB" }), expect.anything());
    await expect(response.json()).resolves.toEqual({
      reply: "Proposal prepared to turn ON Juan trAIder.",
      available: true,
      actionProposal: { id: "proposal-1", botName: "Juan trAIder", action: "TURN_ON", expiresAt: "2026-08-22T15:10:00.000Z" },
      telegramMirrored: false
    });
  });
});
