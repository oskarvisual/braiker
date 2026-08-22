import { describe, expect, it } from "vitest";
import { defaultResourceSources } from "./resource-catalog";

describe("default resource catalog", () => {
  it("starts with public primary sources for every supported category", () => {
    expect(defaultResourceSources.map((source) => source.category)).toEqual(expect.arrayContaining(["MACRO", "FILINGS", "SENTIMENT", "TECHNICAL"]));
    expect(defaultResourceSources.every((source) => source.url.startsWith("https://"))).toBe(true);
    expect(defaultResourceSources.filter((source) => source.autoActivate).map((source) => source.hostname)).toEqual(expect.arrayContaining(["www.sec.gov", "www.bls.gov", "www.bea.gov"]));
  });
});
