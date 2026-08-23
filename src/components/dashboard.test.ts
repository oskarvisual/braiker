import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard fleet presentation", () => {
  it("shows fleet capital without decorative initials and labels broker data as Alpaca Paper", () => {
    const component = readFileSync(resolve(process.cwd(), "src/components/dashboard.tsx"), "utf8");

    expect(component).toContain("BOT LIQUID CAPITAL");
    expect(component).toContain("No orders reported by Alpaca Paper.");
    expect(component).not.toContain('bot.name.slice(0, 1).toUpperCase()');
  });
});
