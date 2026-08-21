import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { globalPaperBroker } from "@/modules/broker/global-paper";
import { requireUser } from "@/modules/auth/session";
import { validatePaperCapitalPool } from "@/modules/wallets/paper-capital-pool";

const scope = "global";
const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const updateSchema = z.object({ managedCapital: money });

export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const pool = await prisma.paperCapitalPool.findUniqueOrThrow({ where: { scope } });
    return NextResponse.json({ managedCapital: pool.managedCapital.toString(), availableCapital: pool.unallocatedCapital.toString(), allocatedCapital: pool.managedCapital.minus(pool.unallocatedCapital).toString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const body = updateSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_PAPER_CAPITAL" }, { status: 400 });
    const [pool, account] = await Promise.all([
      prisma.paperCapitalPool.findUniqueOrThrow({ where: { scope } }),
      globalPaperBroker().getAccount()
    ]);
    const allocatedCapital = pool.managedCapital.minus(pool.unallocatedCapital);
    const result = validatePaperCapitalPool({ managedCapital: body.data.managedCapital, allocatedCapital: allocatedCapital.toString(), requestedWalletCapital: "0", brokerCash: account.cash });
    if (result) return NextResponse.json({ error: result }, { status: 400 });
    const nextManagedCapital = new Prisma.Decimal(body.data.managedCapital);
    const updated = await prisma.paperCapitalPool.update({ where: { scope }, data: { managedCapital: nextManagedCapital, unallocatedCapital: nextManagedCapital.minus(allocatedCapital) } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "GLOBAL_PAPER_CAPITAL_UPDATED", target: scope, metadata: { managedCapital: updated.managedCapital.toString(), brokerCash: account.cash } } });
    return NextResponse.json({ managedCapital: updated.managedCapital.toString(), availableCapital: updated.unallocatedCapital.toString(), allocatedCapital: allocatedCapital.toString(), brokerCash: account.cash });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 });
  }
}
