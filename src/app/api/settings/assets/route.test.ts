import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn()
}));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { tradableAsset: { findMany: mocks.findMany, count: mocks.count } } }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/modules/broker/global-paper", () => ({ globalPaperBroker: vi.fn() }));

describe("GET /api/settings/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.findMany.mockResolvedValue([{ symbol: "QQQ", enabled: true }]);
    mocks.count.mockResolvedValue(6);
  });

  it("queries one selected or available list server-side with its matching count", async () => {
    const route = await import("./route");

    const response = await route.GET(new Request("http://localhost/api/settings/assets?enabled=false&q=QQQ"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ assets: [{ symbol: "QQQ", enabled: true }], nextCursor: null, total: 6 });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        enabled: false,
        active: true,
        tradable: true,
        OR: [
          { symbol: { contains: "QQQ" } },
          { name: { contains: "QQQ" } },
          { exchange: { contains: "QQQ" } }
        ]
      },
      orderBy: [{ symbol: "asc" }],
      take: 101
    });
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        enabled: false,
        active: true,
        tradable: true,
        OR: [
          { symbol: { contains: "QQQ" } },
          { name: { contains: "QQQ" } },
          { exchange: { contains: "QQQ" } }
        ]
      }
    });
  });

  it("returns a cursor instead of silently dropping the next page", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 101 }, (_, index) => ({ symbol: `ASSET${String(index).padStart(3, "0")}`, enabled: false })));
    const route = await import("./route");

    const response = await route.GET(new Request("http://localhost/api/settings/assets?enabled=false"));
    const body = await response.json() as { assets: Array<{ symbol: string }>; nextCursor: string | null; total: number };

    expect(body.assets).toHaveLength(100);
    expect(body.nextCursor).toBe("ASSET099");
    expect(body.total).toBe(6);
  });
});
