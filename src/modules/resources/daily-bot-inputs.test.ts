import { describe, expect, it, vi } from "vitest";
import { buildDailyBotInput, publishDailyBotInputs } from "./daily-bot-inputs";

describe("daily bot inputs", () => {
  it("adapts cited context to a bot while permitting only caution or deferral", () => {
    const input = buildDailyBotInput({
      bot: { id: "bot-1", name: "Guardian One", templateId: "GUARDIAN", watchlist: [{ symbol: "QQQ" }] },
      brief: { id: "brief-1", marketDate: new Date("2026-08-22T00:00:00.000Z"), resources: [{ source: { category: "MACRO", hostname: "www.federalreserve.gov" }, snapshot: { contentHash: "a".repeat(64) } }] }
    });
    expect(input.bot).toEqual({ name: "Guardian One", template: "GUARDIAN", symbols: ["QQQ"] });
    expect(input.recommendations.join(" ")).toContain("defer");
    expect(input.executionPolicy).toContain("never create a signal");
    expect(input.citations).toEqual([{ category: "MACRO", hostname: "www.federalreserve.gov", hash: "a".repeat(64) }]);
  });

  it("upserts one daily input per living bot and day", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "input-1" });
    const db = {
      dailyMarketBrief: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "brief-1", marketDate: new Date("2026-08-22T00:00:00.000Z"), resources: [] }) },
      botInstance: { findMany: vi.fn().mockResolvedValue([{ id: "bot-1", name: "Navigator", templateId: "NAVIGATOR", watchlist: [{ symbol: "SPY" }] }]) },
      dailyBotInput: { upsert }
    } as never;
    await publishDailyBotInputs("brief-1", db);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { botId_marketDate: { botId: "bot-1", marketDate: new Date("2026-08-22T00:00:00.000Z") } }, create: expect.objectContaining({ dailyMarketBriefId: "brief-1" }) }));
  });
});
