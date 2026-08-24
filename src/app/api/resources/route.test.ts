import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), findSources: vi.fn(), findBriefs: vi.fn() }));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { resourceSource: { findMany: mocks.findSources }, dailyMarketBrief: { findMany: mocks.findBriefs } } }));

describe("GET /api/resources pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.findSources.mockResolvedValue([]);
    mocks.findBriefs.mockResolvedValue([]);
  });

  it("returns a bounded source page instead of the complete library", async () => {
    const route = await import("./route");
    const response = await route.GET(new Request("http://localhost/api/resources?page=3"));

    expect(response.status).toBe(200);
    expect(mocks.findSources).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 26 }));
    await expect(response.json()).resolves.toMatchObject({ sources: [], page: 3, hasMore: false });
  });

  it("rejects a non-admin before querying resource pages", async () => {
    mocks.requireUser.mockResolvedValue({ id: "viewer-1", role: "VIEWER" });
    const route = await import("./route");
    const response = await route.GET(new Request("http://localhost/api/resources"));

    expect(response.status).toBe(403);
    expect(mocks.findSources).not.toHaveBeenCalled();
  });
});
