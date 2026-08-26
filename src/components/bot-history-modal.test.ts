import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("bot history chat actions", () => {
  it("only renders contextual Ask in chat actions while the bot chat is available", () => {
    const component = readFileSync(resolve(process.cwd(), "src/components/bot-history-modal.tsx"), "utf8");

    expect(component).toContain("{chatActive && <button");
    expect(component).not.toContain('disabled={!chatActive}');
  });

  it("shows durable monthly virtual-cost records inside Analysis activity", () => {
    const component = readFileSync(resolve(process.cwd(), "src/components/bot-history-modal.tsx"), "utf8");

    expect(component).toContain("Monthly virtual operating cost charged");
    expect(component).toContain("data.scans.length + data.operatingCosts.length");
  });

  it("exposes a performance view that separates capital flows from trading P&L", () => {
    const component = readFileSync(resolve(process.cwd(), "src/components/bot-history-modal.tsx"), "utf8");

    expect(component).toContain(">Performance</button>");
    expect(component).toContain("Trading P&L excludes money added to or returned from the bot.");
    expect(component).toContain("<PerformanceChart points={data.performanceHistory} />");
  });
});
