import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";

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

export async function GET() {
  try {
    await requireAdmin();
    const events = await prisma.macroCalendarEvent.findMany({ where: { startsAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }, orderBy: { startsAt: "asc" }, take: 100 });
    return NextResponse.json({ events: events.map(serialize) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "MACRO_EVENTS_LIST_FAILED" }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const body = eventSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_MACRO_EVENT" }, { status: 400 });
    const event = await prisma.macroCalendarEvent.create({ data: { provider: "ADMIN", title: body.data.title, impact: body.data.impact, startsAt: new Date(body.data.startsAt), sourceUrl: body.data.sourceUrl } });
    return NextResponse.json(serialize(event), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "MACRO_EVENT_CREATE_FAILED" }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 });
  }
}
