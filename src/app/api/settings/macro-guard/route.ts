import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { defaultMacroGuardWindow, normalizeMacroGuardWindow } from "@/modules/resources/macro-guard-settings";

const schema = z.object({ beforeMinutes: z.number().int(), afterMinutes: z.number().int() });

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

export async function GET() {
  try {
    await requireAdmin();
    const current = await prisma.macroGuardSettings.findUnique({ where: { scope: "global" } });
    return NextResponse.json(current ? normalizeMacroGuardWindow(current) : defaultMacroGuardWindow, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "MACRO_GUARD_GET_FAILED" }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 });
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_MACRO_GUARD" }, { status: 400 });
    const window = normalizeMacroGuardWindow(parsed.data);
    const saved = await prisma.macroGuardSettings.upsert({ where: { scope: "global" }, create: { scope: "global", ...window }, update: window });
    await prisma.auditLog.create({ data: { userId: user.id, action: "MACRO_GUARD_UPDATED", target: "global", metadata: window } });
    return NextResponse.json({ beforeMinutes: saved.beforeMinutes, afterMinutes: saved.afterMinutes });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MACRO_GUARD_UPDATE_FAILED";
    return NextResponse.json({ error: code === "FORBIDDEN" ? code : code.startsWith("MACRO_GUARD_") ? code : "MACRO_GUARD_UPDATE_FAILED" }, { status: code === "FORBIDDEN" ? 403 : 400 });
  }
}
