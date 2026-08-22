import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("bot history chat actions", () => {
  it("only renders contextual Ask in chat actions while the bot chat is available", () => {
    const component = readFileSync(resolve(process.cwd(), "src/components/bot-history-modal.tsx"), "utf8");

    expect(component).toContain("{chatActive && <button");
    expect(component).not.toContain('disabled={!chatActive}');
  });
});
