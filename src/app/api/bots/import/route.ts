import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWalletRole } from "@/modules/auth/session";
import { assertGloballyEnabledSymbols } from "@/modules/watchlist/asset-universe";
import { getConfiguredBotTemplate } from "@/modules/bots/profile-defaults";
import { applyBotRiskLimits } from "@/modules/bots/bot-customization";
import { validateBudgetAllocation } from "@/modules/capital/capital-policy";
import { parseBotTransferPackage } from "@/modules/bots/bot-transfer";

const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const importSchema = z.object({ walletId: z.string().uuid(), budget: money, packet: z.unknown() });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = importSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "BOT_IMPORT_INVALID_REQUEST" }, { status: 400 });
    const packet = parseBotTransferPackage(body.data.packet);
    const user = await requireWalletRole(body.data.walletId, ["ADMIN"]);
    const symbols = await assertGloballyEnabledSymbols(packet.bot.symbols, prisma);
    const template = await getConfiguredBotTemplate(packet.bot.templateId);
    const riskPolicy = applyBotRiskLimits(template.riskPolicy, packet.bot.riskLimits);
    const budget = new Prisma.Decimal(body.data.budget);
    const imported = await prisma.$transaction(async (tx) => {
      const alreadyImported = await tx.botImportReceipt.findUnique({ where: { packageHash: packet.contentHash }, select: { id: true } });
      if (alreadyImported) throw new Error("BOT_IMPORT_DUPLICATE_PACKAGE");
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: body.data.walletId }, select: { unallocatedCapital: true } });
      const budgetError = validateBudgetAllocation({ unallocatedCapital: wallet.unallocatedCapital.toString(), requestedBudget: body.data.budget });
      if (budgetError) throw new Error(budgetError);
      const reserved = await tx.wallet.updateMany({ where: { id: body.data.walletId, unallocatedCapital: { gte: budget } }, data: { unallocatedCapital: { decrement: budget } } });
      if (reserved.count !== 1) throw new Error("INSUFFICIENT_UNALLOCATED_CAPITAL");
      const created = await tx.botInstance.create({ data: {
        walletId: body.data.walletId,
        name: packet.bot.name,
        templateId: template.id,
        avatarSeed: packet.bot.avatarSeed,
        runMode: "OFF",
        status: "PAUSED",
        killSwitch: true,
        initialCapital: budget,
        currentCapital: budget,
        adaptiveRiskEnabled: packet.bot.adaptiveRiskEnabled,
        riskPolicy,
        strategyProfile: { ...packet.bot.strategyProfile, templateId: template.id, customInstructions: packet.bot.customInstructions },
        watchlist: { create: symbols.map((symbol) => ({ symbol })) },
        memories: { create: { kind: "CONFIG", content: { source: "BOT_IMPORT", packageHash: packet.contentHash, templateId: template.id, symbols, customInstructions: packet.bot.customInstructions, adaptiveRiskEnabled: packet.bot.adaptiveRiskEnabled, riskLimits: packet.bot.riskLimits } } }
      } });
      if (packet.bot.learnedInstructions.length) await tx.botLearnedInstruction.createMany({ data: packet.bot.learnedInstructions.map((rule) => ({ botId: created.id, createdById: user.id, source: "IMPORTED", content: rule.content, revision: rule.revision, active: rule.active, deactivatedAt: rule.deactivatedAt ? new Date(rule.deactivatedAt) : null, createdAt: new Date(rule.createdAt) })) });
      await tx.botCapitalEvent.create({ data: { botId: created.id, kind: "ALLOCATION", amount: budget, balanceAfter: budget, metadata: { source: "WALLET_UNALLOCATED_CAPITAL", importPackageHash: packet.contentHash } } });
      await tx.botImportReceipt.create({ data: { packageHash: packet.contentHash, schemaVersion: packet.schemaVersion, importedById: user.id, botId: created.id, manifest: JSON.parse(JSON.stringify({ kind: packet.kind, schemaVersion: packet.schemaVersion, exportedAt: packet.exportedAt, bot: packet.bot })) as Prisma.InputJsonValue } });
      const updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: body.data.walletId }, select: { unallocatedCapital: true } });
      return { bot: created, unallocatedCapital: updatedWallet.unallocatedCapital };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await prisma.auditLog.create({ data: { userId: user.id, walletId: body.data.walletId, action: "BOT_IMPORTED", target: imported.bot.id, metadata: { packageHash: packet.contentHash, schemaVersion: packet.schemaVersion, sourceExportedAt: packet.exportedAt } } });
    return NextResponse.json({ id: imported.bot.id, name: imported.bot.name, templateId: imported.bot.templateId, avatarSeed: imported.bot.avatarSeed, status: imported.bot.status, runMode: imported.bot.runMode, lifeStatus: imported.bot.lifeStatus, initialCapital: imported.bot.initialCapital.toString(), currentCapital: imported.bot.currentCapital.toString(), walletUnallocatedCapital: imported.unallocatedCapital.toString(), killSwitch: imported.bot.killSwitch, adaptiveRiskEnabled: imported.bot.adaptiveRiskEnabled, riskPolicy: imported.bot.riskPolicy, assets: { value: "0", valuedAt: null, unpricedSymbols: [] } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOT_IMPORT_FAILED" }, { status: 400 });
  }
}
