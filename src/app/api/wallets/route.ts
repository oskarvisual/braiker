import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/http";
import { requireUser } from "@/modules/auth/session";

const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const createSchema = z.object({ name: z.string().trim().min(2).max(120), managedCapital: money.default("100") });

export async function GET() {
  try {
    const user = await requireUser();
    const wallets = user.role === "ADMIN"
      ? await prisma.wallet.findMany({ orderBy: { createdAt: "desc" } })
      : await prisma.wallet.findMany({ where: { members: { some: { userId: user.id } } }, orderBy: { createdAt: "desc" } });
    return NextResponse.json(wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, currency: wallet.currency, createdAt: wallet.createdAt })));
  } catch { return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const body = createSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    if (Number(body.data.managedCapital) <= 0) return NextResponse.json({ error: "Invalid managed capital" }, { status: 400 });
    const wallet = await prisma.wallet.create({ data: { name: body.data.name, managedCapital: body.data.managedCapital, unallocatedCapital: body.data.managedCapital, members: { create: { userId: user.id, role: "ADMIN" } } } });
    await prisma.auditLog.create({ data: { userId: user.id, walletId: wallet.id, action: "WALLET_CREATED", target: wallet.id } });
    return NextResponse.json({ id: wallet.id, name: wallet.name, currency: wallet.currency, managedCapital: wallet.managedCapital.toString(), unallocatedCapital: wallet.unallocatedCapital.toString() }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}
