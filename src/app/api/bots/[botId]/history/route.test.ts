import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), findBot: vi.fn(), findProposals: vi.fn(), findAdjustments: vi.fn(), findCosts: vi.fn(), findOrders: vi.fn(), findPositions: vi.fn(), findCapitalEvents: vi.fn(), aggregateFills: vi.fn(), findSnapshots: vi.fn() }));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { botInstance: { findUnique: mocks.findBot }, tradeProposal: { findMany: mocks.findProposals }, botRiskAdjustment: { findMany: mocks.findAdjustments }, operatingCostAllocation: { findMany: mocks.findCosts }, position: { findMany: mocks.findPositions }, order: { findMany: mocks.findOrders }, botCapitalEvent: { findMany: mocks.findCapitalEvents }, fill: { aggregate: mocks.aggregateFills }, botPerformanceSnapshot: { findMany: mocks.findSnapshots } } }));

const bot = { id: "bot-1", name: "Alpha", templateId: "NAVIGATOR", avatarSeed: "compass", lifeStatus: "ACTIVE", runMode: "PAPER_ACTIVE", status: "RUNNING", killSwitch: false, adaptiveRiskEnabled: false, currentCapital: "100", initialCapital: "100", reservedCapital: "0", wallet: { members: [{ userId: "operator-1" }] }, watchlist: [], botPositions: [] };

describe("GET /api/bots/[botId]/history pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "operator-1", role: "OPERATOR" });
    mocks.findBot.mockResolvedValue(bot);
    mocks.findProposals.mockResolvedValue([]);
    mocks.findAdjustments.mockResolvedValue([]);
    mocks.findCosts.mockResolvedValue([]);
    mocks.findPositions.mockResolvedValue([]);
    mocks.findOrders.mockResolvedValue([]);
    mocks.findCapitalEvents.mockResolvedValue([{ kind: "ALLOCATION", amount: "100" }]);
    mocks.aggregateFills.mockResolvedValue({ _sum: { realizedPnl: "0" } });
    mocks.findSnapshots.mockResolvedValue([]);
  });

  it("bounds operations, adjustments, and costs to the requested page", async () => {
    const route = await import("./route");
    const response = await route.GET(new Request("http://localhost/api/bots/bot-1/history?page=4"), { params: Promise.resolve({ botId: "bot-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.findOrders).toHaveBeenCalledWith(expect.objectContaining({ skip: 75, take: 26 }));
    expect(mocks.findAdjustments).toHaveBeenCalledWith(expect.objectContaining({ skip: 75, take: 26 }));
    expect(mocks.findCosts).toHaveBeenCalledWith(expect.objectContaining({ skip: 75, take: 26 }));
    await expect(response.json()).resolves.toMatchObject({ page: 4, hasMore: { orders: false, adjustments: false, operatingCosts: false }, orders: [], adaptiveRiskAdjustments: [], operatingCosts: [] });
  });

  it("keeps each history type's remaining-page indicator separate", async () => {
    mocks.findCosts.mockResolvedValue(Array.from({ length: 26 }, (_, index) => ({ id: `cost-${index}`, billingMonth: new Date("2026-08-01T00:00:00.000Z"), monthlyCost: "10", allocatedAmount: "10", chargedAmount: "10", unpaidAmount: "0", capitalBefore: "100", capitalAfter: "90", createdAt: new Date("2026-08-01T00:00:00.000Z") })));
    const route = await import("./route");
    const response = await route.GET(new Request("http://localhost/api/bots/bot-1/history?page=1"), { params: Promise.resolve({ botId: "bot-1" }) });

    await expect(response.json()).resolves.toMatchObject({ hasMore: { orders: false, adjustments: false, operatingCosts: true } });
  });

  it("rejects a bot outside the caller wallet before loading history", async () => {
    mocks.findBot.mockResolvedValue({ ...bot, wallet: { members: [] } });
    const route = await import("./route");
    const response = await route.GET(new Request("http://localhost/api/bots/bot-1/history"), { params: Promise.resolve({ botId: "bot-1" }) });

    expect(response.status).toBe(404);
    expect(mocks.findOrders).not.toHaveBeenCalled();
  });

  it("returns return metrics separately from contributions and daily equity history", async () => {
    mocks.findBot.mockResolvedValue({ ...bot, currentCapital: "65", botPositions: [{ id: "position-1", symbol: "SPY", quantity: "1", averageEntryPrice: "75" }] });
    mocks.findPositions.mockResolvedValue([{ symbol: "SPY", quantity: "10", marketValue: "900", updatedAt: new Date("2026-08-26T15:00:00.000Z") }]);
    mocks.findCapitalEvents.mockResolvedValue([{ kind: "ALLOCATION", amount: "100" }, { kind: "TOP_UP", amount: "50" }, { kind: "WITHDRAWAL", amount: "-10" }, { kind: "OPERATING_COST", amount: "-5" }]);
    mocks.aggregateFills.mockResolvedValue({ _sum: { realizedPnl: "5" } });
    mocks.findCosts.mockResolvedValue([{ id: "cost-1", billingMonth: new Date("2026-08-01T00:00:00.000Z"), monthlyCost: "5", allocatedAmount: "5", chargedAmount: "5", unpaidAmount: "0", capitalBefore: "100", capitalAfter: "95", createdAt: new Date("2026-08-01T00:00:00.000Z") }]);
    mocks.findSnapshots.mockResolvedValue([{ marketDate: new Date("2026-08-25T00:00:00.000Z"), liquidCapital: "75", assetValue: "85", equity: "160", capturedAt: new Date("2026-08-25T20:00:00.000Z") }]);
    const route = await import("./route");

    const response = await route.GET(new Request("http://localhost/api/bots/bot-1/history"), { params: Promise.resolve({ botId: "bot-1" }) });

    await expect(response.json()).resolves.toMatchObject({
      performance: { startingCapital: "100", netContributions: "140", liquidCapital: "65", assets: "90", equity: "155", realizedPnl: "5", unrealizedPnl: "15", tradingPnl: "20", operatingCosts: "5" },
      performanceHistory: [{ marketDate: "2026-08-25T00:00:00.000Z", liquidCapital: "75", assets: "85", equity: "160", capturedAt: "2026-08-25T20:00:00.000Z" }]
    });
  });

  it("reads the newest 90 daily snapshots and returns them chronologically", async () => {
    mocks.findSnapshots.mockResolvedValue([
      { marketDate: new Date("2026-08-26T00:00:00.000Z"), liquidCapital: "100", assetValue: "0", equity: "100", capturedAt: new Date("2026-08-26T20:00:00.000Z") },
      { marketDate: new Date("2026-08-25T00:00:00.000Z"), liquidCapital: "90", assetValue: "0", equity: "90", capturedAt: new Date("2026-08-25T20:00:00.000Z") }
    ]);
    const route = await import("./route");
    const response = await route.GET(new Request("http://localhost/api/bots/bot-1/history"), { params: Promise.resolve({ botId: "bot-1" }) });

    expect(mocks.findSnapshots).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { marketDate: "desc" }, take: 90 }));
    await expect(response.json()).resolves.toMatchObject({ performanceHistory: [
      { marketDate: "2026-08-25T00:00:00.000Z" },
      { marketDate: "2026-08-26T00:00:00.000Z" }
    ] });
  });
});
