import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { canManageUsers, passwordPolicyError } from "@/modules/auth/authorization";
import { requireUser } from "@/modules/auth/session";

const createSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]),
  temporaryPassword: z.string().min(1)
});

export async function GET() {
  try {
    const actor = await requireUser();
    if (!canManageUsers(actor.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, role: true, mustChangePassword: true, createdAt: true } });
    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    if (!canManageUsers(actor.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const body = createSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid user" }, { status: 400 });
    const passwordError = passwordPolicyError(body.data.temporaryPassword);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
    const user = await prisma.user.create({ data: { email: body.data.email, role: body.data.role, passwordHash: await bcrypt.hash(body.data.temporaryPassword, 12), mustChangePassword: true } });
    await prisma.auditLog.create({ data: { userId: actor.id, action: "USER_CREATED", target: user.id, metadata: { role: user.role } } });
    return NextResponse.json({ id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message === "P2002" ? "Email already exists" : message }, { status: 400 });
  }
}
