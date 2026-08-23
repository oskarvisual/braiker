import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("settings layout", () => {
  it("stacks synchronization before the expandable wallet section", () => {
    const settings = readFileSync(resolve(process.cwd(), "src/components/settings.tsx"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "src/app/styles.css"), "utf8");

    expect(styles).toContain(".settingsGrid { display:grid; grid-template-columns:1fr;");
    expect(styles).toContain(".synchronizationPanel { order:-1; }");
  });

  it("mounts wallet and bot-default editors in a full-viewport overlay", () => {
    const settings = readFileSync(resolve(process.cwd(), "src/components/settings.tsx"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "src/app/styles.css"), "utf8");

    expect(settings).toContain('{showWalletModal && typeof document !== "undefined" && createPortal(<div className="modalOverlay settingsModalOverlay"');
    expect(settings).toContain('{capitalWallet && typeof document !== "undefined" && createPortal(<div className="modalOverlay settingsModalOverlay"');
    expect(settings).toContain('{editingProfile && typeof document !== "undefined" && createPortal(<div className="modalOverlay settingsModalOverlay"');
    expect(styles).toContain(".settingsModalOverlay { z-index:120; width:100vw; height:100vh; }");
  });

  it("keeps the manual monthly virtual cost opt-in disabled by default in the supplied settings", () => {
    const settings = readFileSync(resolve(process.cwd(), "src/components/settings.tsx"), "utf8");
    const page = readFileSync(resolve(process.cwd(), "src/app/settings/page.tsx"), "utf8");

    expect(settings).toContain("Charge living bots monthly");
    expect(page).toContain("enabled: operatingCostSettings?.enabled ?? false");
  });
});
