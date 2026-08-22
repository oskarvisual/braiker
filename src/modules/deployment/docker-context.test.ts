import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Docker build context", () => {
  it("excludes credentials and generated output", () => {
    const dockerignore = readFileSync(resolve(process.cwd(), ".dockerignore"), "utf8");
    for (const entry of [".env", ".env.*", ".next", "dist"]) expect(dockerignore).toContain(entry);
  });

  it("ships the Prisma CLI required by the pre-deploy migration job", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    expect(packageJson.dependencies?.prisma).toBeDefined();
  });
});
