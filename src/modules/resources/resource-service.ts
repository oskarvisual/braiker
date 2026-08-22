import type { PrismaClient } from "@prisma/client";
import { defaultResourceSources } from "./resource-catalog";
import { assessResourceUrl, trustedResourceDomains, type ResourceCategory } from "./resource-policy";

type ResourceDb = Pick<PrismaClient, "resourceSource">;

export async function ensureDefaultResourceSources(db: ResourceDb) {
  await Promise.all(defaultResourceSources.map((source) => db.resourceSource.upsert({
    where: { url: source.url },
    create: {
      category: source.category,
      name: source.name,
      url: source.url,
      hostname: source.hostname,
      active: source.autoActivate,
      autoActivated: source.autoActivate,
      reviewStatus: source.autoActivate ? "APPROVED" : "PENDING",
      refreshMinutes: source.refreshMinutes,
    },
    // Do not undo an administrator's active/pause decision on startup.
    update: { category: source.category, name: source.name, hostname: source.hostname, refreshMinutes: source.refreshMinutes, autoActivated: source.autoActivate }
  })));
}

export async function createResourceReview(input: { url: string; category: ResourceCategory; userId: string }, db: ResourceDb) {
  const assessed = assessResourceUrl(input.url, trustedResourceDomains);
  if (!assessed.accepted) throw new Error(assessed.reason);
  const name = assessed.hostname;
  return db.resourceSource.upsert({
    where: { url: assessed.canonicalUrl },
    create: {
      category: input.category,
      name,
      url: assessed.canonicalUrl,
      hostname: assessed.hostname,
      active: assessed.autoActivate,
      autoActivated: assessed.autoActivate,
      reviewStatus: assessed.autoActivate ? "APPROVED" : "PENDING",
      proposedById: input.userId,
    },
    update: { category: input.category, proposedById: input.userId }
  });
}

/** A URL change is a new trust decision: unrecognized domains are paused. */
export async function updateResourceReview(input: { id: string; url: string; category: ResourceCategory; userId: string }, db: ResourceDb) {
  const assessed = assessResourceUrl(input.url, trustedResourceDomains);
  if (!assessed.accepted) throw new Error(assessed.reason);
  return db.resourceSource.update({
    where: { id: input.id },
    data: {
      category: input.category,
      url: assessed.canonicalUrl,
      hostname: assessed.hostname,
      name: assessed.hostname,
      proposedById: input.userId,
      autoActivated: assessed.autoActivate,
      active: assessed.autoActivate,
      reviewStatus: assessed.autoActivate ? "APPROVED" : "PENDING",
      lastFetchedAt: null,
      nextRefreshAt: null,
      lastError: null,
    }
  });
}
