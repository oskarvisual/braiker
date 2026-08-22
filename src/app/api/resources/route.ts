import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { createResourceReview, updateResourceReview } from "@/modules/resources/resource-service";
import { resourceCategories } from "@/modules/resources/resource-policy";

const createSchema = z.object({ url: z.string().trim().max(190).url(), category: z.enum(resourceCategories) });
const updateSchema = z.object({ id: z.string().uuid(), active: z.boolean().optional(), url: z.string().trim().max(190).url().optional(), category: z.enum(resourceCategories).optional() })
  .refine((value) => typeof value.active === "boolean" || (Boolean(value.url) && Boolean(value.category)), { message: "RESOURCE_UPDATE_REQUIRED" });

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

type SourceWithSnapshots = Prisma.ResourceSourceGetPayload<{ include: { snapshots: true } }>;

function publicSource(source: SourceWithSnapshots) {
  return {
    id: source.id, name: source.name, category: source.category, url: source.url, hostname: source.hostname,
    active: source.active, autoActivated: source.autoActivated, reviewStatus: source.reviewStatus, refreshMinutes: source.refreshMinutes,
    lastFetchedAt: source.lastFetchedAt?.toISOString() ?? null, nextRefreshAt: source.nextRefreshAt?.toISOString() ?? null,
    lastError: source.lastError, updatedAt: source.updatedAt.toISOString(),
    snapshots: source.snapshots.map((snapshot) => ({ id: snapshot.id, canonicalUrl: snapshot.canonicalUrl, title: snapshot.title, contentHash: snapshot.contentHash, excerpt: snapshot.excerpt, summary: snapshot.summary, relevance: snapshot.relevance, fetchedAt: snapshot.fetchedAt.toISOString() })),
  };
}

export async function GET() {
  try {
    await requireAdmin();
    const sources = await prisma.resourceSource.findMany({
      orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
      include: { snapshots: { orderBy: { fetchedAt: "desc" }, take: 10 } }
    });
    return NextResponse.json({ sources: sources.map(publicSource) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHENTICATED" }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const body = createSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_RESOURCE" }, { status: 400 });
    const source = await createResourceReview({ ...body.data, userId: user.id }, prisma);
    await prisma.auditLog.create({ data: { userId: user.id, action: "RESOURCE_REVIEW_CREATED", target: source.id, metadata: { category: source.category, hostname: source.hostname, autoActivated: source.autoActivated } } });
    return NextResponse.json({ source: { id: source.id, active: source.active, reviewStatus: source.reviewStatus } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const safe = ["FORBIDDEN", "UNAUTHENTICATED", "HTTPS_REQUIRED", "PRIVATE_HOST", "INVALID_URL"].includes(message) ? message : "RESOURCE_CREATE_FAILED";
    return NextResponse.json({ error: safe }, { status: safe === "FORBIDDEN" ? 403 : safe === "UNAUTHENTICATED" ? 401 : 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const body = updateSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_RESOURCE_UPDATE" }, { status: 400 });
    const source = body.data.url && body.data.category
      ? await updateResourceReview({ id: body.data.id, url: body.data.url, category: body.data.category, userId: user.id }, prisma)
      : await prisma.resourceSource.update({ where: { id: body.data.id }, data: { active: body.data.active!, reviewStatus: body.data.active ? "APPROVED" : "PAUSED" } });
    await prisma.auditLog.create({ data: { userId: user.id, action: body.data.url ? "RESOURCE_SOURCE_EDITED" : "RESOURCE_SOURCE_UPDATED", target: source.id, metadata: { active: source.active, category: source.category, hostname: source.hostname } } });
    return NextResponse.json({ id: source.id, name: source.name, url: source.url, hostname: source.hostname, category: source.category, active: source.active, autoActivated: source.autoActivated, reviewStatus: source.reviewStatus, lastFetchedAt: source.lastFetchedAt?.toISOString() ?? null, nextRefreshAt: source.nextRefreshAt?.toISOString() ?? null, lastError: source.lastError });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message === "FORBIDDEN" ? "FORBIDDEN" : message === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "RESOURCE_UPDATE_FAILED" }, { status: message === "FORBIDDEN" ? 403 : message === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
