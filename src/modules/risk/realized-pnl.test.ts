import { describe, expect, it } from "vitest";
import { realizedPnlWindows } from "@/modules/risk/realized-pnl";

describe("realizedPnlWindows", () => {
  it("queries realized fills for the current UTC day and rolling seven-day window", async () => {
    const calls: unknown[] = [];
    const fills = { aggregate: async (query: unknown) => { calls.push(query); return { _sum: { realizedPnl: "-2.50" } }; } };

    await expect(realizedPnlWindows(fills, "bot-1", new Date("2026-08-20T12:00:00.000Z"))).resolves.toEqual({ dailyPnl: "-2.50", weeklyPnl: "-2.50" });
    expect(calls).toEqual([
      { where: { botId: "bot-1", filledAt: { gte: new Date("2026-08-20T00:00:00.000Z"), lte: new Date("2026-08-20T12:00:00.000Z") } }, _sum: { realizedPnl: true } },
      { where: { botId: "bot-1", filledAt: { gte: new Date("2026-08-14T12:00:00.000Z"), lte: new Date("2026-08-20T12:00:00.000Z") } }, _sum: { realizedPnl: true } }
    ]);
  });

  it("returns decimal zero only when there are no realized fills", async () => {
    const fills = { aggregate: async () => ({ _sum: { realizedPnl: null } }) };
    await expect(realizedPnlWindows(fills, "bot-1", new Date("2026-08-20T12:00:00.000Z"))).resolves.toEqual({ dailyPnl: "0", weeklyPnl: "0" });
  });
});
