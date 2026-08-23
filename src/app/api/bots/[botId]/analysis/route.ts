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
    const [scans, operatingCosts] = await Promise.all([
      prisma.botScanRun.findMany({ where: { botId }, orderBy: { startedAt: "desc" }, take: 100 }),
      prisma.operatingCostAllocation.findMany({ where: { botId }, orderBy: { createdAt: "desc" }, take: 100 })
    ]);
    return NextResponse.json({ bot: { id: bot.id, name: bot.name }, scans: scans.map(presentBotScanRun), operatingCosts: operatingCosts.map((cost) => ({ id: cost.id, billingMonth: cost.billingMonth.toISOString(), allocatedAmount: cost.allocatedAmount.toString(), chargedAmount: cost.chargedAmount.toString(), unpaidAmount: cost.unpaidAmount.toString(), capitalAfter: cost.capitalAfter.toString(), createdAt: cost.createdAt.toISOString() })) });
  } catch {
    return NextResponse.json({ error: "BOT_ANALYSIS_UNAVAILABLE" }, { status: 400 });
  }
}
