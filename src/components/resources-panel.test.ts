import { describe, expect, it } from "vitest";
import { resourceFormDraft, type ResourceView } from "./resources-panel";

const source: ResourceView = { id: "source-1", name: "BLS", category: "MACRO", url: "https://www.bls.gov/", hostname: "www.bls.gov", active: true, autoActivated: true, reviewStatus: "APPROVED", refreshMinutes: 1440, lastFetchedAt: null, nextRefreshAt: null, lastError: null, updatedAt: "2026-08-22T00:00:00.000Z", snapshots: [] };

describe("resource modal drafts", () => {
  it("starts a new resource with the NEWS category and preloads the selected resource for editing", () => {
    expect(resourceFormDraft()).toEqual({ url: "", category: "NEWS" });
    expect(resourceFormDraft(source)).toEqual({ url: "https://www.bls.gov/", category: "MACRO" });
  });
});
