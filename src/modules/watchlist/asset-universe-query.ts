import type { Prisma } from "@prisma/client";

const ASSET_UNIVERSE_RESULT_LIMIT = 100;
const ASSET_SEARCH_MAX_LENGTH = 64;

export function buildAssetUniversePageQuery(input: { enabled: boolean; query?: string | null; cursor?: string | null }): Prisma.TradableAssetFindManyArgs {
  const query = (input.query ?? "").trim().slice(0, ASSET_SEARCH_MAX_LENGTH);
  const baseWhere: Prisma.TradableAssetWhereInput = { enabled: input.enabled, active: true, tradable: true };
  const orderBy: Prisma.TradableAssetOrderByWithRelationInput[] = [{ symbol: "asc" }];

  if (!query) {
    return {
      where: baseWhere,
      orderBy,
      ...(input.cursor ? { cursor: { symbol: input.cursor }, skip: 1 } : {}),
      take: ASSET_UNIVERSE_RESULT_LIMIT + 1
    };
  }

  const normalizedQuery = query.toUpperCase();
  return {
    where: {
      ...baseWhere,
      OR: [
        { symbol: { contains: normalizedQuery } },
        { name: { contains: normalizedQuery } },
        { exchange: { contains: normalizedQuery } }
      ]
    },
    orderBy,
    ...(input.cursor ? { cursor: { symbol: input.cursor }, skip: 1 } : {}),
    take: ASSET_UNIVERSE_RESULT_LIMIT + 1
  };
}
