import { describe, expect, it, vi } from "vitest";
import { adaptiveRiskFingerprint, recordAdaptiveRiskAdjustment } from "./adaptive-risk-audit";

const policy = { maxPositionSize: "5", maxPortfolioExposure: "35", maxDailyLoss: "1", maxWeeklyLoss: "6", maxTradesPerDay: 2, allowMargin: false, allowShorting: false, allowOptions: false, allowLeverage: false, marketOrderBufferPct: "0.02" };

describe("adaptive risk audit", () => {
  it("records a posture change with its effective and administrator-owned policies", async () => {
    const db = { botRiskAdjustment: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "adjustment-1" }) } };

    const created = await recordAdaptiveRiskAdjustment({ botId: "bot-1", level: "CAUTIOUS", reason: "capital below 85%", basePolicy: { ...policy, maxPositionSize: "10", maxDailyLoss: "2", maxTradesPerDay: 4 }, effectivePolicy: policy }, db);

    expect(created).toBe(true);
    expect(db.botRiskAdjustment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ botId: "bot-1", level: "CAUTIOUS", basePolicy: expect.objectContaining({ maxPositionSize: "10" }), effectivePolicy: expect.objectContaining({ maxPositionSize: "5" }) }) }));
  });

  it("does not write duplicate adjustments while the effective posture is unchanged", async () => {
    const db = { botRiskAdjustment: { findFirst: vi.fn(), create: vi.fn() } };
    const input = { botId: "bot-1", level: "CAUTIOUS" as const, reason: "capital below 85%", basePolicy: { ...policy, maxPositionSize: "10", maxDailyLoss: "2", maxTradesPerDay: 4 }, effectivePolicy: policy };
    db.botRiskAdjustment.findFirst.mockResolvedValue({ fingerprint: adaptiveRiskFingerprint(input) });

    await expect(recordAdaptiveRiskAdjustment(input, db)).resolves.toBe(false);
    expect(db.botRiskAdjustment.create).not.toHaveBeenCalled();
  });
});
