import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), rename: vi.fn(), archive: vi.fn(), assertSameOrigin: vi.fn() }));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/modules/manager-chat/manager-chat-service", () => ({ renameManagerConversation: mocks.rename, archiveManagerConversation: mocks.archive }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("PATCH /api/manager/sessions/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  });

  it("renames a manager-owned ordinary session", async () => {
    mocks.rename.mockResolvedValue({ id: "session-1", title: "Capital review", archivedAt: null });
    const route = await import("./route");
    const response = await route.PATCH(new Request("http://localhost/api/manager/sessions/session-1", { method: "PATCH", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ action: "RENAME", title: "Capital review" }) }), { params: Promise.resolve({ sessionId: "session-1" }) });

    expect(mocks.rename).toHaveBeenCalledWith({ userId: "admin-1", sessionId: "session-1", title: "Capital review" }, {});
    await expect(response.json()).resolves.toEqual({ session: { id: "session-1", title: "Capital review", archivedAt: null } });
  });

  it("returns the protected-session error instead of archiving Operations", async () => {
    mocks.archive.mockRejectedValue(new Error("MANAGER_OPERATIONS_SESSION_PROTECTED"));
    const route = await import("./route");
    const response = await route.PATCH(new Request("http://localhost/api/manager/sessions/operations", { method: "PATCH", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ action: "ARCHIVE" }) }), { params: Promise.resolve({ sessionId: "operations" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "MANAGER_OPERATIONS_SESSION_PROTECTED" });
  });
});
