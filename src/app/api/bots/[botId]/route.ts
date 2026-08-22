import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertGloballyEnabledSymbols } from "@/modules/watchlist/asset-universe";
import { requireWalletRole } from "@/modules/auth/session";
import { applyBotRiskLimits } from "@/modules/bots/bot-customization";
import { canDeleteBot } from "@/modules/bots/bot-lifecycle";
import { getConfiguredBotTemplate } from "@/modules/bots/profile-defaults";

const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const updateSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), templateId: z.enum(["GUARDIAN", "NAVIGATOR", "EXPLORER"]).optional(), symbols: z.array(z.string().min(1).max(16)).min(1).max(50).optional(), customInstructions: z.string().trim().max(1200).optional(), riskLimits: z.object({ maxPositionSize: money.optional(), maxDailyLoss: money.optional(), maxTradesPerDay: z.number().int().min(1).optional() }).optional() });

async function editableBot(botId: string) {
  const bot = await prisma.botInstance.findUniqueOrThrow({ where: { id: botId } });
  const user = await requireWalletRole(bot.walletId, ["ADMIN"]);
  return { bot, user };
}

export async function PATCH(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    assertSameOrigin(request);
    const { botId } = await context.params;
    const { bot, user } = await editableBot(botId);
    const body = updateSchema.safeParse(await request.json());
    if (!body.success || (!body.data.name && !body.data.templateId && !body.data.symbols && body.data.customInstructions === undefined && !body.data.riskLimits)) return NextResponse.json({ error: "Invalid bot update" }, { status: 400 });
    const template = body.data.templateId ? await getConfiguredBotTemplate(body.data.templateId) : null;
    const symbols = body.data.symbols ? await assertGloballyEnabledSymbols(body.data.symbols, prisma) : null;
    const profile = template?.riskPolicy ?? (await getConfiguredBotTemplate(bot.templateId as "GUARDIAN" | "NAVIGATOR" | "EXPLORER")).riskPolicy;
    const riskPolicy = applyBotRiskLimits(profile, body.data.riskLimits);
    const priorStrategy = bot.strategyProfile as { customInstructions?: string };
    const updated = await prisma.$transaction(async (tx) => {
      if (symbols) { await tx.watchlist.deleteMany({ where: { botId } }); await tx.watchlist.createMany({ data: symbols.map((symbol) => ({ botId, symbol })) }); }
      return tx.botInstance.update({ where: { id: bot.id }, data: { name: body.data.name, riskPolicy, ...(template ? { templateId: template.id, avatarSeed: template.avatar } : {}), strategyProfile: { ...priorStrategy, ...(template?.strategyProfile ?? {}), strategyId: "trend-v1", version: 1, templateId: template?.id ?? bot.templateId, customInstructions: body.data.customInstructions ?? priorStrategy.customInstructions ?? "" } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await prisma.auditLog.create({ data: { userId: user.id, walletId: bot.walletId, action: "BOT_UPDATED", target: botId } });
    return NextResponse.json({ id: updated.id, name: updated.name, templateId: updated.templateId, avatarSeed: updated.avatarSeed, riskPolicy: updated.riskPolicy });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    assertSameOrigin(request);
    const { botId } = await context.params;
    const { bot, user } = await editableBot(botId);
    if (bot.lifeStatus === "DEAD") return NextResponse.json({ error: "DEAD_BOT_HISTORY_IS_IMMUTABLE" }, { status: 400 });
    if (!canDeleteBot({ lifeStatus: bot.lifeStatus, runMode: bot.runMode })) return NextResponse.json({ error: "POWER_OFF_BOT_BEFORE_DELETION" }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({ where: { id: bot.walletId }, data: { unallocatedCapital: { increment: bot.currentCapital } } });
      await tx.botInstance.delete({ where: { id: bot.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await prisma.auditLog.create({ data: { userId: user.id, walletId: bot.walletId, action: "BOT_DELETED", target: bot.id, metadata: { returnedCapital: bot.currentCapital.toString() } } });
    return new NextResponse(null, { status: 204 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}
