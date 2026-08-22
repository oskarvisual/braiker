import { describe, expect, it, vi } from "vitest";
import { createResourceReview, ensureDefaultResourceSources, updateResourceReview } from "./resource-service";

describe("resource service", () => {
  it("seeds the curated registry without overwriting an administrator pause", async () => {
    const db = { resourceSource: { upsert: vi.fn().mockResolvedValue({}) } };
    await ensureDefaultResourceSources(db as never);
    expect(db.resourceSource.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ name: expect.any(String) }),
      create: expect.objectContaining({ active: true, reviewStatus: "APPROVED" }),
    }));
    expect((db.resourceSource.upsert.mock.calls[0][0].update as Record<string, unknown>).active).toBeUndefined();
  });

  it("stores a user-provided URL as a pending review when its domain is not trusted", async () => {
    const db = { resourceSource: { upsert: vi.fn().mockResolvedValue({ id: "source-1", active: false, reviewStatus: "PENDING" }) } };
    await expect(createResourceReview({ url: "https://example.org/market-note", category: "NEWS", userId: "admin-1" }, db as never)).resolves.toMatchObject({ id: "source-1", active: false });
    expect(db.resourceSource.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ reviewStatus: "PENDING", active: false }) }));
  });

  it("revalidates an edited URL and returns an unfamiliar domain to pending review", async () => {
    const update = vi.fn().mockResolvedValue({ id: "source-1", active: false, reviewStatus: "PENDING" });
    await updateResourceReview({ id: "source-1", url: "https://example.com/markets", category: "NEWS", userId: "admin-1" }, { resourceSource: { update } } as never);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "source-1" },
      data: expect.objectContaining({ url: "https://example.com/markets", hostname: "example.com", name: "example.com", active: false, reviewStatus: "PENDING", category: "NEWS" })
    }));
  });
});
