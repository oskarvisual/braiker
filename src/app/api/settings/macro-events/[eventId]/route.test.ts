import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), assertSameOrigin: vi.fn() }));
vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));

describe("DELETE /api/settings/macro-events/[eventId]", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" }); });
  it("keeps event history immutable, including for an Admin", async () => {
    const route = await import("./route");
    const response = await route.DELETE(new Request("http://localhost/api/settings/macro-events/event-1", { method: "DELETE", headers: { origin: "http://localhost" } }), { params: Promise.resolve({ eventId: "event-1" }) });
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({ error: "MACRO_EVENT_HISTORY_IMMUTABLE" });
  });
});
