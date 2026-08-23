import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), assertSameOrigin: vi.fn(), upsert: vi.fn(), auditCreate: vi.fn() }));
vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/lib/prisma", () => ({ prisma: { operatingCostSettings: { upsert: mocks.upsert }, auditLog: { create: mocks.auditCreate } } }));

describe("operating-cost settings API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" }); mocks.upsert.mockResolvedValue({ enabled: true, monthlyCost: { toString: () => "50.000000000000" } }); });

  it("lets an Admin enable an explicit monthly virtual cost and audits it", async () => {
    const route = await import("./route");
    const response = await route.PUT(new Request("http://localhost/api/settings/operating-costs", { method: "PUT", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ enabled: true, monthlyCost: "50" }) }));
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ scope: "global", enabled: true, monthlyCost: "50" }) }));
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "OPERATING_COST_SETTINGS_UPDATED" }) }));
  });

  it("rejects a disabled-cost mismatch and non-admin caller", async () => {
    const route = await import("./route");
    expect((await route.PUT(new Request("http://localhost/api/settings/operating-costs", { method: "PUT", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ enabled: true, monthlyCost: "0" }) }))).status).toBe(400);
    mocks.requireUser.mockResolvedValue({ id: "viewer-1", role: "VIEWER" });
    expect((await route.PUT(new Request("http://localhost/api/settings/operating-costs", { method: "PUT", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ enabled: false, monthlyCost: "0" }) }))).status).toBe(403);
  });
});
