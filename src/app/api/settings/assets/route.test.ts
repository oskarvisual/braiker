import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  executeRaw: vi.fn(),
  listUsEquities: vi.fn()
}));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { tradableAsset: { findMany: mocks.findMany, count: mocks.count }, $executeRaw: mocks.executeRaw } }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/modules/broker/global-paper", () => ({ globalPaperBroker: vi.fn(() => ({ listUsEquities: mocks.listUsEquities })) }));

describe("GET /api/settings/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.findMany.mockResolvedValue([{ symbol: "QQQ", enabled: true }]);
    mocks.count.mockResolvedValue(6);
    mocks.executeRaw.mockResolvedValue(1);
    mocks.listUsEquities.mockResolvedValue([]);
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

  it("reports the number of completed asset batches when a later batch fails", async () => {
    const { ASSET_CATALOG_SYNC_BATCH_SIZE } = await import("@/modules/watchlist/asset-universe-sync");
    mocks.listUsEquities.mockResolvedValue(Array.from({ length: ASSET_CATALOG_SYNC_BATCH_SIZE + 1 }, (_, index) => ({ symbol: `AST${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`, name: `Asset ${index}`, class: "us_equity", exchange: "NASDAQ", status: "active", tradable: true })));
    mocks.executeRaw.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("timeout"));
    const route = await import("./route");

    const response = await route.POST(new Request("http://localhost/api/settings/assets", { method: "POST" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "ASSET_UNIVERSE_UNAVAILABLE", synced: ASSET_CATALOG_SYNC_BATCH_SIZE });
  });
});
