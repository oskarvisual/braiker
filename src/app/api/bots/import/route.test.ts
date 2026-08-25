import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBotTransferPackage } from "@/modules/bots/bot-transfer";

const mocks = vi.hoisted(() => ({ assertSameOrigin: vi.fn(), requireWalletRole: vi.fn(), enabledSymbols: vi.fn(), template: vi.fn(), transaction: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/modules/auth/session", () => ({ requireWalletRole: mocks.requireWalletRole }));
vi.mock("@/modules/watchlist/asset-universe", () => ({ assertGloballyEnabledSymbols: mocks.enabledSymbols }));
vi.mock("@/modules/bots/profile-defaults", () => ({ getConfiguredBotTemplate: mocks.template }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction, auditLog: { create: mocks.audit } } }));

const policy = { maxPositionSize: "10", maxPortfolioExposure: "35", maxDailyLoss: "2", maxWeeklyLoss: "6", maxTradesPerDay: 4, allowMargin: false, allowShorting: false, allowOptions: false, allowLeverage: false, marketOrderBufferPct: "0.02" };
const packet = buildBotTransferPackage({ name: "Alpha", templateId: "NAVIGATOR", avatarSeed: "compass", symbols: ["AAPL"], customInstructions: "Wait.", adaptiveRiskEnabled: false, riskLimits: { maxPositionSize: "10", maxDailyLoss: "2", maxTradesPerDay: 4 }, strategyProfile: { strategyId: "trend-v1", version: 1, minimumSignalScore: 0.65, trendWeight: 0.3, momentumWeight: 0.25, volumeWeight: 0.2, marketContextWeight: 0.15, volatilityPenalty: 0.1 }, learnedInstructions: [{ source: "MANAGER", content: "Wait for confirmation.", revision: 1, active: true, deactivatedAt: null, createdAt: "2026-08-20T00:00:00.000Z" }] });

describe("POST /api/bots/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWalletRole.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.enabledSymbols.mockResolvedValue(["AAPL"]);
    mocks.template.mockResolvedValue({ id: "NAVIGATOR", avatar: "compass", riskPolicy: policy, strategyProfile: {} });
    mocks.transaction.mockImplementation((callback: (tx: any) => unknown) => callback({ botImportReceipt: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() }, wallet: { findUniqueOrThrow: vi.fn().mockResolvedValue({ unallocatedCapital: { toString: () => "50" } }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, botInstance: { create: vi.fn().mockResolvedValue({ id: "new-bot", walletId: "wallet-1", name: "Alpha", templateId: "NAVIGATOR", avatarSeed: "compass", status: "PAUSED", runMode: "OFF", lifeStatus: "ACTIVE", killSwitch: true, adaptiveRiskEnabled: false, riskPolicy: policy, initialCapital: { toString: () => "50" }, currentCapital: { toString: () => "50" } }) }, botLearnedInstruction: { createMany: vi.fn() }, botCapitalEvent: { create: vi.fn() } }));
  });

  it("creates a fresh OFF paused bot with a wallet-funded budget and imported revisions", async () => {
    const route = await import("./route");
    const response = await route.POST(new Request("http://localhost/api/bots/import", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ walletId: "d9428888-c808-4978-9156-fdd8772a57e2", budget: "50", packet }) }));
    expect(response.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "BOT_IMPORTED", target: "new-bot" }) }));
    await expect(response.json()).resolves.toMatchObject({ id: "new-bot", runMode: "OFF", status: "PAUSED", killSwitch: true });
  });

  it("rejects a tampered package before allocating wallet capital", async () => {
    const route = await import("./route");
    const response = await route.POST(new Request("http://localhost/api/bots/import", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ walletId: "d9428888-c808-4978-9156-fdd8772a57e2", budget: "50", packet: { ...packet, bot: { ...packet.bot, name: "Changed" } } }) }));
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
