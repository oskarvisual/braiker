import { describe, expect, it } from "vitest";
import { fetchSafeResource } from "./resource-fetcher";

describe("safe resource fetcher", () => {
  it("revalidates DNS before fetching and rejects private resolution", async () => {
    await expect(fetchSafeResource("https://www.sec.gov/example", {
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
      fetchImpl: fetch,
    })).rejects.toThrow("PRIVATE_HOST");
  });

  it("extracts bounded evidence from a public HTML response", async () => {
    const result = await fetchSafeResource("https://www.sec.gov/example", {
      lookup: async () => [{ address: "151.101.2.49", family: 4 }],
      fetchImpl: async () => new Response("<title>SEC release</title><p>Material update.</p>", { headers: { "content-type": "text/html" } }),
    });
    expect(result).toMatchObject({ canonicalUrl: "https://www.sec.gov/example", title: "SEC release" });
    expect(result.excerpt).toContain("Material update.");
  });
});
