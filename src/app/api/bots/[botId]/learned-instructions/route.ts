import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWalletRole } from "@/modules/auth/session";

export async function GET(_request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    const { botId } = await context.params;
    const bot = await prisma.botInstance.findUnique({ where: { id: botId }, select: { walletId: true } });
    if (!bot) throw new Error("BOT_NOT_FOUND");
    await requireWalletRole(bot.walletId, ["ADMIN"]);
    const rules = await prisma.botLearnedInstruction.findMany({ where: { botId }, orderBy: { revision: "desc" }, select: { id: true, content: true, revision: true, source: true, active: true, createdAt: true, deactivatedAt: true } });
    return NextResponse.json({ rules: rules.map((rule) => ({ ...rule, createdAt: rule.createdAt.toISOString(), deactivatedAt: rule.deactivatedAt?.toISOString() ?? null })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "LEARNED_INSTRUCTIONS_LIST_FAILED";
    return NextResponse.json({ error: code === "BOT_NOT_FOUND" || code === "FORBIDDEN" ? code : "LEARNED_INSTRUCTIONS_LIST_FAILED" }, { status: code === "BOT_NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 400 });
  }
}
