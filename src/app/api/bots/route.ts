import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWalletRole } from "@/modules/auth/session";
import { Prisma } from "@prisma/client";
import { DEFAULT_RISK_POLICY } from "@/modules/risk/types";
import { ALLOWED_TRADING_SYMBOLS, getBotTemplate } from "@/modules/bots/bot-templates";
import { validateBudgetAllocation } from "@/modules/capital/capital-policy";
import { applyBotRiskLimits } from "@/modules/bots/bot-customization";

const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const createSchema = z.object({
  walletId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  templateId: z.enum(["GUARDIAN", "NAVIGATOR", "EXPLORER"]),
  budget: money,
  symbols: z.array(z.enum(ALLOWED_TRADING_SYMBOLS)).min(1).max(ALLOWED_TRADING_SYMBOLS.length),
  customInstructions: z.string().trim().max(1200).optional(),
  riskLimits: z.object({ maxPositionSize: money.optional(), maxDailyLoss: money.optional(), maxTradesPerDay: z.number().int().min(1).optional() }).optional(),
  sourceBotId: z.string().uuid().optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = createSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid bot" }, { status: 400 });
    const user = await requireWalletRole(body.data.walletId, ["ADMIN"]);
    if (body.data.sourceBotId) {
      const source = await prisma.botInstance.findUnique({ where: { id: body.data.sourceBotId }, select: { id: true } });
      if (!source) return NextResponse.json({ error: "CLONE_SOURCE_NOT_FOUND" }, { status: 400 });
    }
    const template = getBotTemplate(body.data.templateId);
    const riskPolicy = applyBotRiskLimits(template.riskPolicy, body.data.riskLimits);
    const budget = new Prisma.Decimal(body.data.budget);
    const bot = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: body.data.walletId }, select: { unallocatedCapital: true } });
      const budgetError = validateBudgetAllocation({ unallocatedCapital: wallet.unallocatedCapital.toString(), requestedBudget: body.data.budget });
      if (budgetError) throw new Error(budgetError);
      const reserved = await tx.wallet.updateMany({ where: { id: body.data.walletId, unallocatedCapital: { gte: budget } }, data: { unallocatedCapital: { decrement: budget } } });
      if (reserved.count !== 1) throw new Error("INSUFFICIENT_UNALLOCATED_CAPITAL");
      const created = await tx.botInstance.create({ data: {
        walletId: body.data.walletId,
        name: body.data.name,
        templateId: template.id,
        avatarSeed: template.avatar,
        cloneSourceId: body.data.sourceBotId,
        killSwitch: true,
        initialCapital: budget,
        currentCapital: budget,
        riskPolicy: riskPolicy ?? DEFAULT_RISK_POLICY,
        strategyProfile: { strategyId: "hold", version: 1, templateId: template.id, customInstructions: body.data.customInstructions ?? "" },
        watchlist: { create: body.data.symbols.map((symbol) => ({ symbol })) },
        memories: { create: { kind: "CONFIG", content: { templateId: template.id, source: "BOT_CREATED", symbols: body.data.symbols, customInstructions: body.data.customInstructions ?? "", riskLimits: body.data.riskLimits ?? null } } }
      } });
      await tx.botCapitalEvent.create({ data: { botId: created.id, kind: "ALLOCATION", amount: budget, balanceAfter: budget, metadata: { source: "WALLET_UNALLOCATED_CAPITAL" } } });
      const updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: body.data.walletId }, select: { unallocatedCapital: true } });
      return { bot: created, unallocatedCapital: updatedWallet.unallocatedCapital };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await prisma.auditLog.create({ data: { userId: user.id, walletId: bot.bot.walletId, action: body.data.sourceBotId ? "BOT_CLONED" : "BOT_CREATED", target: bot.bot.id, metadata: body.data.sourceBotId ? { sourceBotId: body.data.sourceBotId } : undefined } });
    return NextResponse.json({ id: bot.bot.id, name: bot.bot.name, templateId: bot.bot.templateId, avatarSeed: bot.bot.avatarSeed, status: bot.bot.status, runMode: bot.bot.runMode, lifeStatus: bot.bot.lifeStatus, initialCapital: bot.bot.initialCapital.toString(), currentCapital: bot.bot.currentCapital.toString(), walletUnallocatedCapital: bot.unallocatedCapital.toString(), killSwitch: bot.bot.killSwitch, riskPolicy: bot.bot.riskPolicy }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}
