import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { ResourcesPanel } from "@/components/resources-panel";
import { currentUser } from "@/modules/auth/session";
import { prisma } from "@/lib/prisma";
import { pageResult, PAGE_SIZE } from "@/modules/pagination/page";

function recommendations(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as { recommendations?: unknown }).recommendations;
  return Array.isArray(items) ? items.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
}

export default async function ResourcesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  const [sourceRows, briefRows] = await Promise.all([
    prisma.resourceSource.findMany({ orderBy: [{ category: "asc" }, { updatedAt: "desc" }], take: PAGE_SIZE + 1, include: { snapshots: { orderBy: { fetchedAt: "desc" }, take: 1 } } }),
    prisma.dailyMarketBrief.findMany({ orderBy: { marketDate: "desc" }, take: PAGE_SIZE + 1, include: { resources: { include: { source: { select: { name: true } }, snapshot: { select: { title: true, contentHash: true } } } }, botInputs: { include: { bot: { select: { name: true, templateId: true } } }, orderBy: { bot: { name: "asc" } } } } })
  ]);
  const sources = pageResult(sourceRows);
  const briefs = pageResult(briefRows);
  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><ResourcesPanel initialSources={sources.items.map((source) => ({ id: source.id, name: source.name, category: source.category, url: source.url, hostname: source.hostname, active: source.active, autoActivated: source.autoActivated, reviewStatus: source.reviewStatus, refreshMinutes: source.refreshMinutes, lastFetchedAt: source.lastFetchedAt?.toISOString() ?? null, nextRefreshAt: source.nextRefreshAt?.toISOString() ?? null, lastError: source.lastError, updatedAt: source.updatedAt.toISOString(), snapshots: source.snapshots.map((snapshot) => ({ id: snapshot.id, canonicalUrl: snapshot.canonicalUrl, title: snapshot.title, contentHash: snapshot.contentHash, excerpt: snapshot.excerpt, summary: snapshot.summary, relevance: snapshot.relevance, fetchedAt: snapshot.fetchedAt.toISOString() })) }))} initialBriefs={briefs.items.map((brief) => ({ id: brief.id, marketDate: brief.marketDate.toISOString(), status: brief.status, generatedAt: brief.generatedAt.toISOString(), resources: brief.resources.map((resource) => ({ source: resource.source.name, title: resource.snapshot.title, hash: resource.snapshot.contentHash })), botInputs: brief.botInputs.map((input) => ({ bot: input.bot.name, template: input.bot.templateId, recommendations: recommendations(input.content) })) }))} initialSourceHasMore={sources.hasMore} initialBriefHasMore={briefs.hasMore} /></main></>;
}
