import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { defaultMacroGuardWindow } from "@/modules/resources/macro-guard-settings";

const sourceUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "HTTPS source required");
const eventSchema = z.object({
  title: z.string().trim().min(2).max(255),
  impact: z.enum(["HIGH", "MEDIUM", "LOW"]).default("HIGH"),
  startsAt: z.string().datetime({ offset: true }),
  sourceUrl
});

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

function serialize(event: { id: string; provider: string; title: string; impact: string; startsAt: Date; sourceUrl: string; createdAt: Date }) {
  return { ...event, startsAt: event.startsAt.toISOString(), createdAt: event.createdAt.toISOString() };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const view = url.searchParams.get("view") === "past" ? "past" : "upcoming";
    const take = 25;
    const now = new Date();
    const guard = await prisma.macroGuardSettings.findUnique({ where: { scope: "global" }, select: { afterMinutes: true } });
    const events = await prisma.macroCalendarEvent.findMany({
      where: view === "past" ? { startsAt: { lt: new Date(now.getTime() - (guard?.afterMinutes ?? defaultMacroGuardWindow.afterMinutes) * 60_000) } } : { startsAt: { gte: new Date(now.getTime() - (guard?.afterMinutes ?? defaultMacroGuardWindow.afterMinutes) * 60_000) } },
      orderBy: { startsAt: view === "past" ? "desc" : "asc" },
      skip: (page - 1) * take,
      take: take + 1
    });
    return NextResponse.json({ events: events.slice(0, take).map(serialize), page, hasMore: events.length > take, view }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "MACRO_EVENTS_LIST_FAILED" }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const body = eventSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_MACRO_EVENT" }, { status: 400 });
    const event = await prisma.macroCalendarEvent.create({ data: { provider: "ADMIN", title: body.data.title, impact: body.data.impact, startsAt: new Date(body.data.startsAt), sourceUrl: body.data.sourceUrl, createdById: user.id, sourceReference: "manual-admin" } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "MACRO_EVENT_CREATED", target: event.id, metadata: { provider: "ADMIN", sourceUrl: event.sourceUrl } } });
    return NextResponse.json(serialize(event), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "MACRO_EVENT_CREATE_FAILED" }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 });
  }
}
