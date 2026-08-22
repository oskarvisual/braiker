import { describe, expect, it } from "vitest";
import { buildAssetUniversePageQuery } from "./asset-universe-query";

describe("buildAssetUniversePageQuery", () => {
  it("keeps selected assets in their own paginated list", () => {
    expect(buildAssetUniversePageQuery({ enabled: true })).toEqual({
      where: { enabled: true, active: true, tradable: true },
      orderBy: [{ symbol: "asc" }],
      take: 101
    });
  });

  it("searches only the requested list and resumes after its cursor", () => {
    expect(buildAssetUniversePageQuery({ enabled: false, query: "  qQq ", cursor: "CQQQ" })).toEqual({
      where: {
        enabled: false,
        active: true,
        tradable: true,
        OR: [
          { symbol: { contains: "QQQ" } },
          { name: { contains: "QQQ" } },
          { exchange: { contains: "QQQ" } }
        ]
      },
      orderBy: [{ symbol: "asc" }],
      cursor: { symbol: "CQQQ" },
      skip: 1,
      take: 101
    });
  });
});
