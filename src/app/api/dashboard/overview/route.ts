import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const where = user.role === "ADMIN" ? {} : { wallet: { members: { some: { userId: user.id } } } };
    const bots = await prisma.botInstance.findMany({ where, include: { watchlist: { where: { enabled: true } }, proposals: { orderBy: { createdAt: "desc" }, take: 10, include: { riskDecision: true } } }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ bots: bots.map((bot) => ({ id: bot.id, name: bot.name, templateId: bot.templateId, avatarSeed: bot.avatarSeed, status: bot.status, runMode: bot.runMode, killSwitch: bot.killSwitch, universe: bot.watchlist.map((item) => item.symbol), opportunities: bot.proposals.map((proposal) => ({ id: proposal.id, symbol: proposal.symbol, action: proposal.action, status: proposal.status, reason: proposal.riskDecision?.reason ?? "PENDING_RISK", createdAt: proposal.createdAt })) })) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNAUTHENTICATED" }, { status: 401 }); }
}
