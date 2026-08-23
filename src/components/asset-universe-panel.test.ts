import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("asset universe empty state", () => {
  it("offers an in-context Alpaca sync when no available assets have been loaded", () => {
    const component = readFileSync(new URL("./asset-universe-panel.tsx", import.meta.url), "utf8");

    expect(component).toContain('const needsInitialSync = !enabled && page.total === 0 && !search.trim()');
    expect(component).toContain("No assets have been synchronized yet.");
    expect(component).toContain("Sync assets from Alpaca");
    expect(component).toContain('onClick={() => void sync()}');
  });

  it("keeps the completed asset count visible when a later sync batch fails", () => {
    const component = readFileSync(new URL("./asset-universe-panel.tsx", import.meta.url), "utf8");

    expect(component).toContain("const completed = typeof body.synced === \"number\" ? body.synced : 0");
    expect(component).toContain("were synchronized before the catalog became unavailable");
    expect(component).toContain("await Promise.all([loadPage(true, selectedSearch), loadPage(false, availableSearch)])");
  });
});
