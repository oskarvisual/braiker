import { describe, expect, it, vi } from "vitest";
import { marketTelemetryRetentionCutoffs, retainMarketTelemetry } from "@/modules/market/market-telemetry-retention";

describe("market telemetry retention", () => {
  it("keeps sufficient bar history while bounding diagnostic events and idempotency rows", () => {
    expect(marketTelemetryRetentionCutoffs(new Date("2026-08-28T12:00:00.000Z"))).toEqual({
      barsBefore: new Date("2026-08-14T12:00:00.000Z"),
      eventsBefore: new Date("2026-08-21T12:00:00.000Z"),
      evaluationsBefore: new Date("2026-07-29T12:00:00.000Z")
    });
  });

  it("removes only expired internal market telemetry", async () => {
    const db = {
      marketBar: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      marketStreamEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      marketEvaluation: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) }
    };
    const now = new Date("2026-08-28T12:00:00.000Z");

    await expect(retainMarketTelemetry(db as never, now)).resolves.toEqual({ bars: 2, events: 3, evaluations: 4 });
    expect(db.marketBar.deleteMany).toHaveBeenCalledWith({ where: { timestamp: { lt: new Date("2026-08-14T12:00:00.000Z") } } });
    expect(db.marketStreamEvent.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2026-08-21T12:00:00.000Z") } } });
    expect(db.marketEvaluation.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2026-07-29T12:00:00.000Z") } } });
  });
});
