import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), assertSameOrigin: vi.fn(), delete: vi.fn() }));
vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/lib/prisma", () => ({ prisma: { macroCalendarEvent: { delete: mocks.delete } } }));

describe("DELETE /api/settings/macro-events/[eventId]", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" }); mocks.delete.mockResolvedValue({}); });
  it("allows an Admin to remove an incorrect future event", async () => {
    const route = await import("./route");
    const response = await route.DELETE(new Request("http://localhost/api/settings/macro-events/event-1", { method: "DELETE", headers: { origin: "http://localhost" } }), { params: Promise.resolve({ eventId: "event-1" }) });
    expect(response.status).toBe(204);
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "event-1" } });
  });
});
