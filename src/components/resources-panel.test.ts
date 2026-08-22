import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resourceFormDraft, type ResourceView } from "./resources-panel";

const source: ResourceView = { id: "source-1", name: "BLS", category: "MACRO", url: "https://www.bls.gov/", hostname: "www.bls.gov", active: true, autoActivated: true, reviewStatus: "APPROVED", refreshMinutes: 1440, lastFetchedAt: null, nextRefreshAt: null, lastError: null, updatedAt: "2026-08-22T00:00:00.000Z", snapshots: [] };

describe("resource modal drafts", () => {
  it("starts a new resource with the NEWS category and preloads the selected resource for editing", () => {
    expect(resourceFormDraft()).toEqual({ url: "", category: "NEWS" });
    expect(resourceFormDraft(source)).toEqual({ url: "https://www.bls.gov/", category: "MACRO" });
  });

  it("gives the library search field an explicit Resources visual treatment", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/app/styles.css"), "utf8");
    expect(styles).toMatch(/\.resourceSearch input \{[^}]*min-height:46px[^}]*background:#0a121b[^}]*border:1px solid #40556c/s);
    expect(styles).toContain(".resourceSearch:focus-within input");
  });
});
