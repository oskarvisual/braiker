import type { PrismaClient } from "@prisma/client";
import { fetchSafeResource } from "./resource-fetcher";

type ResourceRefreshDb = Pick<PrismaClient, "resourceSource" | "resourceSnapshot">;
type Evidence = { canonicalUrl: string; title: string; excerpt: string; contentHash: string };

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "RESOURCE_REFRESH_FAILED";
  return message.replace(/https?:\/\/[^\s]+/gi, "[redacted-url]").slice(0, 1_000);
}

/** Refreshes only approved public sources; editorial links remain inactive until reviewed. */
export async function refreshDueResourceSources(now = new Date(), overrides: { db?: ResourceRefreshDb; fetchSource?: (url: string) => Promise<Evidence> } = {}) {
  const db = overrides.db ?? (await import("@/lib/prisma")).prisma;
  const fetchSource = overrides.fetchSource ?? fetchSafeResource;
  const sources = await db.resourceSource.findMany({ where: { active: true, OR: [{ nextRefreshAt: null }, { nextRefreshAt: { lte: now } }] }, select: { id: true, url: true, refreshMinutes: true }, take: 20 });
  let refreshed = 0;
  let failed = 0;
  for (const source of sources) {
    try {
      const evidence = await fetchSource(source.url);
      await db.resourceSnapshot.create({ data: { sourceId: source.id, canonicalUrl: evidence.canonicalUrl, title: evidence.title, excerpt: evidence.excerpt, contentHash: evidence.contentHash, relevance: "UNREVIEWED", fetchedAt: now } });
      await db.resourceSource.update({ where: { id: source.id }, data: { lastFetchedAt: now, nextRefreshAt: new Date(now.getTime() + source.refreshMinutes * 60_000), lastError: null } });
      refreshed += 1;
    } catch (error) {
      await db.resourceSource.update({ where: { id: source.id }, data: { lastError: safeError(error), nextRefreshAt: new Date(now.getTime() + Math.max(source.refreshMinutes, 60) * 60_000) } });
      failed += 1;
    }
  }
  return { refreshed, failed };
}
