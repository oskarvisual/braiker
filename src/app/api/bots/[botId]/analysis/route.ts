import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { presentBotScanRun } from "@/modules/market/bot-analysis-history";

export async function GET(_: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    const user = await requireUser();
    const { botId } = await context.params;
    const bot = await prisma.botInstance.findUnique({
      where: { id: botId },
      include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } } }
    });
    if (!bot || (user.role !== "ADMIN" && bot.wallet.members.length === 0)) return NextResponse.json({ error: "BOT_NOT_FOUND" }, { status: 404 });
    const scans = await prisma.botScanRun.findMany({ where: { botId }, orderBy: { startedAt: "desc" }, take: 100 });
    return NextResponse.json({ bot: { id: bot.id, name: bot.name }, scans: scans.map(presentBotScanRun) });
  } catch {
    return NextResponse.json({ error: "BOT_ANALYSIS_UNAVAILABLE" }, { status: 400 });
  }
}
