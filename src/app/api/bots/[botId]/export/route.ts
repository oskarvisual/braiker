import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { buildBotTransferPackage } from "@/modules/bots/bot-transfer";

export async function GET(_request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { botId } = await context.params;
    const bot = await prisma.botInstance.findUnique({ where: { id: botId }, include: { watchlist: { where: { enabled: true }, orderBy: { symbol: "asc" }, select: { symbol: true } }, learnedInstructions: { orderBy: { revision: "asc" }, select: { source: true, content: true, revision: true, active: true, deactivatedAt: true, createdAt: true } } } });
    if (!bot) return NextResponse.json({ error: "BOT_NOT_FOUND" }, { status: 404 });
    const profile = bot.strategyProfile as Record<string, unknown>;
    const risk = bot.riskPolicy as { maxPositionSize: string; maxDailyLoss: string; maxTradesPerDay: number };
    const packet = buildBotTransferPackage({ name: bot.name, templateId: bot.templateId as "GUARDIAN" | "NAVIGATOR" | "EXPLORER", avatarSeed: bot.avatarSeed, symbols: bot.watchlist.map((item) => item.symbol), customInstructions: typeof profile.customInstructions === "string" ? profile.customInstructions : "", adaptiveRiskEnabled: bot.adaptiveRiskEnabled, riskLimits: { maxPositionSize: risk.maxPositionSize, maxDailyLoss: risk.maxDailyLoss, maxTradesPerDay: risk.maxTradesPerDay }, strategyProfile: { strategyId: "trend-v1", version: 1, minimumSignalScore: Number(profile.minimumSignalScore), trendWeight: Number(profile.trendWeight), momentumWeight: Number(profile.momentumWeight), volumeWeight: Number(profile.volumeWeight), marketContextWeight: Number(profile.marketContextWeight), volatilityPenalty: Number(profile.volatilityPenalty) }, learnedInstructions: bot.learnedInstructions.map((rule) => ({ ...rule, deactivatedAt: rule.deactivatedAt?.toISOString() ?? null, createdAt: rule.createdAt.toISOString() })) });
    return new NextResponse(JSON.stringify(packet, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${bot.name.replaceAll(/[^a-z0-9-_]/gi, "-").toLowerCase() || "bot"}.braiker-bot.json"`, "cache-control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "BOT_EXPORT_FAILED" }, { status: 400 }); }
}
