import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), findBot: vi.fn(), findProposals: vi.fn(), findAdjustments: vi.fn(), findCosts: vi.fn(), findOrders: vi.fn(), findPositions: vi.fn() }));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { botInstance: { findUnique: mocks.findBot }, tradeProposal: { findMany: mocks.findProposals }, botRiskAdjustment: { findMany: mocks.findAdjustments }, operatingCostAllocation: { findMany: mocks.findCosts }, position: { findMany: mocks.findPositions }, order: { findMany: mocks.findOrders } } }));

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
});
