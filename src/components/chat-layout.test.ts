import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared chat layout", () => {
  it("centers empty conversations and aligns the composer controls on a shared grid", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/app/styles.css"), "utf8");

    expect(styles).toContain(".managerEmpty { justify-self:center;");
    expect(styles).toContain(".managerComposer > div { display:grid;");
    expect(styles).toContain("grid-template-columns:minmax(0,1fr) auto;");
    expect(styles).toContain(".managerComposer button { align-self:stretch;");
  });
});
