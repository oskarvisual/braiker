import { describe, expect, it, vi } from "vitest";
import { refreshDueResourceSources } from "./resource-refresh";

describe("resource refresh", () => {
  it("persists bounded evidence and schedules the next safe refresh", async () => {
    const now = new Date("2026-08-22T12:00:00.000Z");
    const db = {
      resourceSource: {
        findMany: vi.fn().mockResolvedValue([{ id: "source-1", url: "https://www.sec.gov/example", refreshMinutes: 60 }]),
        update: vi.fn().mockResolvedValue({}),
      },
      resourceSnapshot: { create: vi.fn().mockResolvedValue({}) },
    };
    await refreshDueResourceSources(now, { db: db as never, fetchSource: async () => ({ canonicalUrl: "https://www.sec.gov/example", title: "SEC", excerpt: "Evidence", contentHash: "a".repeat(64) }) });
    expect(db.resourceSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceId: "source-1", excerpt: "Evidence" }) }));
    expect(db.resourceSource.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastError: null, nextRefreshAt: new Date("2026-08-22T13:00:00.000Z") }) }));
  });
});
