import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireWalletRole: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
  getConfiguredBotTemplate: vi.fn(),
  assertGloballyEnabledSymbols: vi.fn()
}));

vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/modules/auth/session", () => ({ requireWalletRole: mocks.requireWalletRole }));
vi.mock("@/modules/watchlist/asset-universe", () => ({ assertGloballyEnabledSymbols: mocks.assertGloballyEnabledSymbols }));
vi.mock("@/modules/bots/profile-defaults", () => ({ getConfiguredBotTemplate: mocks.getConfiguredBotTemplate }));
vi.mock("@/lib/prisma", () => ({ prisma: { botInstance: { findUniqueOrThrow: mocks.findUniqueOrThrow }, $transaction: mocks.transaction, auditLog: { create: mocks.auditCreate } } }));

const policy = { maxPositionSize: "10", maxPortfolioExposure: "35", maxDailyLoss: "2", maxWeeklyLoss: "6", maxTradesPerDay: 4, allowMargin: false, allowShorting: false, allowOptions: false, allowLeverage: false, marketOrderBufferPct: "0.02" };

describe("PATCH /api/bots/[botId] adaptive risk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUniqueOrThrow.mockResolvedValue({ id: "bot-1", walletId: "wallet-1", templateId: "NAVIGATOR", strategyProfile: {}, riskPolicy: policy });
    mocks.requireWalletRole.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.getConfiguredBotTemplate.mockResolvedValue({ id: "NAVIGATOR", avatar: "compass", strategyProfile: {}, riskPolicy: policy });
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback({ watchlist: { deleteMany: vi.fn(), createMany: vi.fn() }, botInstance: { update: mocks.update } }));
    mocks.update.mockResolvedValue({ id: "bot-1", name: "Alpha", templateId: "NAVIGATOR", avatarSeed: "compass", adaptiveRiskEnabled: true, riskPolicy: policy });
  });

  it("lets an Admin opt a bot into adaptive limits while retaining its saved envelope", async () => {
    const route = await import("./route");
    const response = await route.PATCH(new Request("http://localhost/api/bots/bot-1", { method: "PATCH", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ adaptiveRiskEnabled: true }) }), { params: Promise.resolve({ botId: "bot-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ adaptiveRiskEnabled: true, riskPolicy: policy }) }));
    expect(await response.json()).toMatchObject({ adaptiveRiskEnabled: true, riskPolicy: policy });
  });

  it("rejects a non-boolean adaptive-risk value", async () => {
    const route = await import("./route");
    const response = await route.PATCH(new Request("http://localhost/api/bots/bot-1", { method: "PATCH", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ adaptiveRiskEnabled: "yes" }) }), { params: Promise.resolve({ botId: "bot-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
