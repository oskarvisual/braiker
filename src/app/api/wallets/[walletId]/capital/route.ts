import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWalletRole } from "@/modules/auth/session";
import { validateVirtualWalletCapitalAdjustment } from "@/modules/wallets/paper-capital-pool";

const GLOBAL_SCOPE = "global";
const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const bodySchema = z.object({ direction: z.enum(["ADD", "WITHDRAW"]), amount: money });

export async function POST(request: Request, context: { params: Promise<{ walletId: string }> }) {
  try {
    assertSameOrigin(request);
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_VIRTUAL_CAPITAL" }, { status: 400 });
    const { walletId } = await context.params;
    const user = await requireWalletRole(walletId, ["ADMIN"]);
    const amount = new Prisma.Decimal(body.data.amount);
    const result = await prisma.$transaction(async (tx) => {
      const [wallet, pool] = await Promise.all([
        tx.wallet.findUniqueOrThrow({ where: { id: walletId }, select: { id: true, managedCapital: true, unallocatedCapital: true } }),
        tx.paperCapitalPool.findUniqueOrThrow({ where: { scope: GLOBAL_SCOPE } })
      ]);
      const validation = validateVirtualWalletCapitalAdjustment({ direction: body.data.direction, walletUnallocatedCapital: wallet.unallocatedCapital.toString(), globalAvailableCapital: pool.unallocatedCapital.toString(), amount: body.data.amount });
      if (validation) throw new Error(validation);

      if (body.data.direction === "ADD") {
        const reserved = await tx.paperCapitalPool.updateMany({ where: { scope: GLOBAL_SCOPE, unallocatedCapital: { gte: amount } }, data: { unallocatedCapital: { decrement: amount } } });
        if (reserved.count !== 1) throw new Error("INSUFFICIENT_PAPER_CAPITAL");
        await tx.wallet.update({ where: { id: wallet.id }, data: { managedCapital: { increment: amount }, unallocatedCapital: { increment: amount } } });
      } else {
        const released = await tx.wallet.updateMany({ where: { id: wallet.id, unallocatedCapital: { gte: amount } }, data: { managedCapital: { decrement: amount }, unallocatedCapital: { decrement: amount } } });
        if (released.count !== 1) throw new Error("WALLET_CAPITAL_ASSIGNED_TO_BOTS");
        await tx.paperCapitalPool.update({ where: { scope: GLOBAL_SCOPE }, data: { unallocatedCapital: { increment: amount } } });
      }

      const [updatedWallet, updatedPool] = await Promise.all([
        tx.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { managedCapital: true, unallocatedCapital: true } }),
        tx.paperCapitalPool.findUniqueOrThrow({ where: { scope: GLOBAL_SCOPE } })
      ]);
      return { managedCapital: updatedWallet.managedCapital.toString(), unallocatedCapital: updatedWallet.unallocatedCapital.toString(), paperCapitalAvailable: updatedPool.unallocatedCapital.toString(), paperCapitalAllocated: updatedPool.managedCapital.minus(updatedPool.unallocatedCapital).toString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await prisma.auditLog.create({ data: { userId: user.id, walletId, action: body.data.direction === "ADD" ? "VIRTUAL_WALLET_CAPITAL_ADDED" : "VIRTUAL_WALLET_CAPITAL_RELEASED", target: walletId, metadata: { amount: body.data.amount } } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 });
  }
}
