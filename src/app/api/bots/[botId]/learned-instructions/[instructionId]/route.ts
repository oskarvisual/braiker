import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWalletRole } from "@/modules/auth/session";

export async function DELETE(request: Request, context: { params: Promise<{ botId: string; instructionId: string }> }) {
  try {
    assertSameOrigin(request);
    const { botId, instructionId } = await context.params;
    const bot = await prisma.botInstance.findUnique({ where: { id: botId }, select: { walletId: true } });
    if (!bot) throw new Error("BOT_NOT_FOUND");
    const user = await requireWalletRole(bot.walletId, ["ADMIN"]);
    const result = await prisma.botLearnedInstruction.updateMany({ where: { id: instructionId, botId, active: true }, data: { active: false, deactivatedAt: new Date() } });
    if (result.count !== 1) throw new Error("LEARNED_INSTRUCTION_NOT_FOUND");
    await prisma.auditLog.create({ data: { userId: user.id, walletId: bot.walletId, action: "BOT_LEARNED_INSTRUCTION_DEACTIVATED", target: instructionId, metadata: { botId } } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "LEARNED_INSTRUCTION_DELETE_FAILED";
    return NextResponse.json({ error: ["BOT_NOT_FOUND", "LEARNED_INSTRUCTION_NOT_FOUND", "FORBIDDEN"].includes(code) ? code : "LEARNED_INSTRUCTION_DELETE_FAILED" }, { status: code === "BOT_NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 400 });
  }
}
