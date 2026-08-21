import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bot table layout", () => {
  it("reserves enough desktop space for both view and edit actions", () => {
    const styles = readFileSync(new URL("./bot-setup.module.css", import.meta.url), "utf8");

    expect(styles).toMatch(/\.botSetup :global\(\.botTable \.userRow\)\s*\{\s*grid-template-columns:\s*minmax\(180px, 1\.15fr\).*88px 120px;/s);
  });
});
