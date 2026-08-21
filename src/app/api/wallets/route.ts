import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/http";
import { requireUser } from "@/modules/auth/session";

const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const createSchema = z.object({ name: z.string().trim().min(2).max(120), managedCapital: money.default("100") });
const GLOBAL_SCOPE = "global";

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
    const managedCapital = new Prisma.Decimal(body.data.managedCapital);
    if (managedCapital.lte(0)) return NextResponse.json({ error: "INVALID_VIRTUAL_CAPITAL" }, { status: 400 });
    const wallet = await prisma.$transaction(async (tx) => {
      const updated = await tx.paperCapitalPool.updateMany({ where: { scope: GLOBAL_SCOPE, unallocatedCapital: { gte: managedCapital } }, data: { unallocatedCapital: { decrement: managedCapital } } });
      if (updated.count !== 1) throw new Error("INSUFFICIENT_PAPER_CAPITAL");
      const created = await tx.wallet.create({ data: { name: body.data.name, managedCapital, unallocatedCapital: managedCapital, members: { create: { userId: user.id, role: "ADMIN" } } } });
      await tx.auditLog.create({ data: { userId: user.id, walletId: created.id, action: "VIRTUAL_WALLET_CREATED", target: created.id, metadata: { managedCapital: managedCapital.toString() } } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const pool = await prisma.paperCapitalPool.findUniqueOrThrow({ where: { scope: GLOBAL_SCOPE } });
    return NextResponse.json({ id: wallet.id, name: wallet.name, currency: wallet.currency, managedCapital: wallet.managedCapital.toString(), unallocatedCapital: wallet.unallocatedCapital.toString(), paperCapitalAvailable: pool.unallocatedCapital.toString() }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}
