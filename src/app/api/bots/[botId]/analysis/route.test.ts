import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), findBot: vi.fn(), findScans: vi.fn() }));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { botInstance: { findUnique: mocks.findBot }, botScanRun: { findMany: mocks.findScans } } }));

describe("GET /api/bots/[botId]/analysis pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "operator-1", role: "OPERATOR" });
    mocks.findBot.mockResolvedValue({ id: "bot-1", name: "Alpha", wallet: { members: [{ userId: "operator-1" }] } });
    mocks.findScans.mockResolvedValue([]);
  });

  it("requests one bounded later page for an authorized wallet member", async () => {
    const route = await import("./route");
    const response = await route.GET(new Request("http://localhost/api/bots/bot-1/analysis?page=2"), { params: Promise.resolve({ botId: "bot-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.findScans).toHaveBeenCalledWith({ where: { botId: "bot-1" }, orderBy: { startedAt: "desc" }, skip: 25, take: 26 });
    await expect(response.json()).resolves.toMatchObject({ scans: [], page: 2, hasMore: false });
  });

  it("does not disclose scans outside the caller wallet", async () => {
    mocks.findBot.mockResolvedValue({ id: "bot-1", name: "Alpha", wallet: { members: [] } });
    const route = await import("./route");
    const response = await route.GET(new Request("http://localhost/api/bots/bot-1/analysis"), { params: Promise.resolve({ botId: "bot-1" }) });

    expect(response.status).toBe(404);
    expect(mocks.findScans).not.toHaveBeenCalled();
  });
});
