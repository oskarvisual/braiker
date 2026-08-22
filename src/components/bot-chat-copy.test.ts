import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("bot chat copy", () => {
  it("does not imply that an individual bot has a Telegram channel", () => {
    const component = readFileSync(resolve(process.cwd(), "src/components/bot-chat.tsx"), "utf8");

    expect(component).not.toContain("Visible here only — never sent to Telegram.");
  });
});
