import { describe, expect, it, vi } from "vitest";
import { buildDailyBriefContent, isSameNewYorkCalendarDay, publishDailyMarketBrief } from "./daily-market-brief";

describe("daily market brief", () => {
  it("is immutable after the first pre-market publication for a day", async () => {
    const create = vi.fn().mockResolvedValue({ id: "brief-1" });
    const db = { dailyMarketBrief: { findUnique: vi.fn().mockResolvedValue(null), create }, resourceSnapshot: { findMany: vi.fn().mockResolvedValue([{ id: "snapshot-1", sourceId: "source-1", title: "Fed calendar", canonicalUrl: "https://federalreserve.gov/calendar", contentHash: "a".repeat(64), excerpt: "A public event summary", fetchedAt: new Date("2026-08-22T12:00:00.000Z"), source: { category: "MACRO", name: "Federal Reserve" } }]) } } as never;
    await publishDailyMarketBrief(new Date("2026-08-22T00:00:00.000Z"), db);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ marketDate: new Date("2026-08-22T00:00:00.000Z"), resources: { create: [{ sourceId: "source-1", snapshotId: "snapshot-1" }] } }) }));
  });

  it("keeps resource evidence as citations and explicitly forbids it from creating a trade", () => {
    const content = buildDailyBriefContent([{ id: "snapshot-1", sourceId: "source-1", title: "Fed calendar", canonicalUrl: "https://federalreserve.gov/calendar", contentHash: "a".repeat(64), excerpt: "A public event summary", fetchedAt: new Date("2026-08-22T12:00:00.000Z"), source: { category: "MACRO", name: "Federal Reserve" } }]);
    expect(content.executionPolicy).toContain("never create a signal");
    expect(content.citations[0]).toEqual(expect.objectContaining({ snapshotId: "snapshot-1", source: "Federal Reserve" }));
  });

  it("recognizes a market day only when Alpaca's next open is on the same New York date", () => {
    expect(isSameNewYorkCalendarDay(new Date("2026-08-24T12:30:00.000Z"), new Date("2026-08-24T13:30:00.000Z"))).toBe(true);
    expect(isSameNewYorkCalendarDay(new Date("2026-08-25T12:30:00.000Z"), new Date("2026-08-26T13:30:00.000Z"))).toBe(false);
  });
});
