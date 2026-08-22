import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listManagerConversations: vi.fn(),
  createManagerConversation: vi.fn()
}));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/modules/manager-chat/manager-chat-service", () => ({
  createManagerConversation: mocks.createManagerConversation,
  listManagerConversations: mocks.listManagerConversations
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("GET /api/manager/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns persisted Telegram transcript messages for the signed-in manager", async () => {
    mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.listManagerConversations.mockResolvedValue([
      {
        id: "operations-1",
        title: "Bot Manager · Operations",
        kind: "OPERATIONS",
        pinned: true,
        updatedAt: new Date("2026-08-21T21:02:00.000Z"),
        messages: [
          {
            id: "telegram-msg-1",
            role: "USER",
            source: "TELEGRAM",
            content: "que sugieres?",
            createdAt: new Date("2026-08-21T21:01:00.000Z")
          }
        ]
      }
    ]);

    const route = (await import("./route")) as { GET?: () => Promise<Response> };
    expect(route.GET).toBeTypeOf("function");

    const response = await route.GET!();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      sessions: [
        {
          id: "operations-1",
          title: "Bot Manager · Operations",
          kind: "OPERATIONS",
          pinned: true,
          updatedAt: "2026-08-21T21:02:00.000Z",
          messages: [
            {
              id: "telegram-msg-1",
              role: "USER",
              source: "TELEGRAM",
              content: "que sugieres?",
              createdAt: "2026-08-21T21:01:00.000Z"
            }
          ]
        }
      ]
    });
    expect(mocks.listManagerConversations).toHaveBeenCalledWith("admin-1", {});
  });

  it("denies a non-admin without reading conversations", async () => {
    mocks.requireUser.mockResolvedValue({ id: "viewer-1", role: "VIEWER" });
    const route = (await import("./route")) as { GET?: () => Promise<Response> };

    const response = await route.GET!();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "FORBIDDEN" });
    expect(mocks.listManagerConversations).not.toHaveBeenCalled();
  });
});
