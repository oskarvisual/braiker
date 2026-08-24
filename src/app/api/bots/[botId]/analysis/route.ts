import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { presentBotScanRun } from "@/modules/market/bot-analysis-history";
import { pageResult, pageWindow } from "@/modules/pagination/page";

export async function GET(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    const user = await requireUser();
    const { botId } = await context.params;
    const bot = await prisma.botInstance.findUnique({
      where: { id: botId },
      include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } } }
    });
    if (!bot || (user.role !== "ADMIN" && bot.wallet.members.length === 0)) return NextResponse.json({ error: "BOT_NOT_FOUND" }, { status: 404 });
    const { page, skip, take } = pageWindow(new URL(request.url).searchParams.get("page"));
    const rows = await prisma.botScanRun.findMany({ where: { botId }, orderBy: { startedAt: "desc" }, skip, take });
    const scans = pageResult(rows);
    return NextResponse.json({ bot: { id: bot.id, name: bot.name }, scans: scans.items.map(presentBotScanRun), page, hasMore: scans.hasMore });
  } catch {
    return NextResponse.json({ error: "BOT_ANALYSIS_UNAVAILABLE" }, { status: 400 });
  }
}
