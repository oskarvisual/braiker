import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWalletRole } from "@/modules/auth/session";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { validateCapitalAdjustment } from "@/modules/capital/capital-policy";

const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const bodySchema = z.object({ direction: z.enum(["ADD", "WITHDRAW"]), amount: money });

export async function POST(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    assertSameOrigin(request);
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_CAPITAL_ADJUSTMENT" }, { status: 400 });
    const { botId } = await context.params;
    const initialBot = await prisma.botInstance.findUniqueOrThrow({ where: { id: botId }, select: { walletId: true } });
    const user = await requireWalletRole(initialBot.walletId, ["ADMIN"]);
    const amount = new Prisma.Decimal(body.data.amount);
    const result = await prisma.$transaction(async (tx) => {
      const bot = await tx.botInstance.findUniqueOrThrow({ where: { id: botId }, select: { id: true, walletId: true, lifeStatus: true, currentCapital: true, reservedCapital: true } });
      if (bot.lifeStatus === "DEAD") throw new Error("DEAD_BOT_HISTORY_IS_IMMUTABLE");
      if (!bot.reservedCapital.isZero()) throw new Error("CAPITAL_RESERVED_BY_OPEN_ORDER");
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: bot.walletId }, select: { id: true, unallocatedCapital: true } });
      const validation = validateCapitalAdjustment({ direction: body.data.direction, walletUnallocatedCapital: wallet.unallocatedCapital.toString(), botCurrentCapital: bot.currentCapital.toString(), amount: body.data.amount });
      if (validation) throw new Error(validation);
      if (body.data.direction === "ADD") {
        const reserved = await tx.wallet.updateMany({ where: { id: wallet.id, unallocatedCapital: { gte: amount } }, data: { unallocatedCapital: { decrement: amount } } });
        if (reserved.count !== 1) throw new Error("INSUFFICIENT_UNALLOCATED_CAPITAL");
        await tx.botInstance.update({ where: { id: bot.id }, data: { currentCapital: { increment: amount }, initialCapital: { increment: amount } } });
      } else {
        const updated = await tx.botInstance.updateMany({ where: { id: bot.id, lifeStatus: "ACTIVE", currentCapital: { gt: amount }, reservedCapital: 0 }, data: { currentCapital: { decrement: amount } } });
        if (updated.count !== 1) throw new Error("WITHDRAWAL_MUST_LEAVE_CAPITAL");
        await tx.wallet.update({ where: { id: wallet.id }, data: { unallocatedCapital: { increment: amount } } });
      }
      const updatedBot = await tx.botInstance.findUniqueOrThrow({ where: { id: bot.id }, select: { currentCapital: true, initialCapital: true } });
      const updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { unallocatedCapital: true } });
      await tx.botCapitalEvent.create({ data: { botId: bot.id, kind: body.data.direction === "ADD" ? "TOP_UP" : "WITHDRAWAL", amount: body.data.direction === "ADD" ? amount : amount.negated(), balanceAfter: updatedBot.currentCapital, metadata: { source: "WALLET_UNALLOCATED_CAPITAL" } } });
      return { currentCapital: updatedBot.currentCapital.toString(), initialCapital: updatedBot.initialCapital.toString(), walletUnallocatedCapital: updatedWallet.unallocatedCapital.toString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await prisma.auditLog.create({ data: { userId: user.id, walletId: initialBot.walletId, action: body.data.direction === "ADD" ? "BOT_CAPITAL_ADDED" : "BOT_CAPITAL_WITHDRAWN", target: botId, metadata: { amount: body.data.amount } } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 });
  }
}
