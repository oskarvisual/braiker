import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { canManageUsers, canModifyUser } from "@/modules/auth/authorization";
import { requireUser } from "@/modules/auth/session";

const updateSchema = z.object({ role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]) });

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    if (!canManageUsers(actor.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { userId } = await context.params;
    if (!canModifyUser(actor.id, userId)) return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
    const body = updateSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    const user = await prisma.user.update({ where: { id: userId }, data: { role: body.data.role } });
    await prisma.auditLog.create({ data: { userId: actor.id, action: "USER_ROLE_CHANGED", target: user.id, metadata: { role: user.role } } });
    return NextResponse.json({ id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message === "P2025" ? "User not found" : message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    if (!canManageUsers(actor.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { userId } = await context.params;
    if (!canModifyUser(actor.id, userId)) return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.auditLog.create({ data: { userId: actor.id, action: "USER_DELETED", target: userId } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message === "P2025" ? "User not found" : message }, { status: 400 });
  }
}
