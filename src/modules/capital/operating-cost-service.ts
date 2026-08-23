import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { allocateMonthlyOperatingCost, applyOperatingCostDebit, monthlyOperatingCostBillingMonth } from "@/modules/capital/operating-cost-policy";

type Db = PrismaClient | Prisma.TransactionClient;

async function chargeOneBot(input: { botId: string; allocatedAmount: string; monthlyCost: string; billingMonth: Date }, db: PrismaClient) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT \`id\` FROM \`BotInstance\` WHERE \`id\` = ${input.botId} FOR UPDATE`;
    const bot = await tx.botInstance.findUnique({ where: { id: input.botId } });
    if (!bot || bot.lifeStatus !== "ACTIVE") return { charged: false, skipped: true };
    const existing = await tx.operatingCostAllocation.findUnique({ where: { botId_billingMonth: { botId: bot.id, billingMonth: input.billingMonth } } });
    if (existing) return { charged: false, skipped: true };
    const openPositionCount = await tx.botPosition.count({ where: { botId: bot.id, quantity: { gt: 0 } } });
    const debit = applyOperatingCostDebit({ currentCapital: bot.currentCapital.toString(), reservedCapital: bot.reservedCapital.toString(), allocatedAmount: input.allocatedAmount, openPositionCount });
    const died = debit.lifeStatus === "DEAD";
    await tx.botInstance.update({
      where: { id: bot.id },
      data: died
        ? { currentCapital: debit.capitalAfter, lifeStatus: "DEAD", diedAt: new Date(), runMode: "OFF", status: "PAUSED", killSwitch: true }
        : { currentCapital: debit.capitalAfter }
    });
    await tx.operatingCostAllocation.create({ data: {
      botId: bot.id, billingMonth: input.billingMonth, monthlyCost: input.monthlyCost, allocatedAmount: input.allocatedAmount,
      chargedAmount: debit.chargedAmount, unpaidAmount: debit.unpaidAmount, capitalBefore: bot.currentCapital, capitalAfter: debit.capitalAfter
    } });
    await tx.botCapitalEvent.create({ data: {
      botId: bot.id, kind: "OPERATING_COST", amount: new Prisma.Decimal(debit.chargedAmount).negated(), balanceAfter: debit.capitalAfter,
      metadata: { billingMonth: input.billingMonth.toISOString().slice(0, 10), monthlyCost: input.monthlyCost, allocatedAmount: input.allocatedAmount, unpaidAmount: debit.unpaidAmount }
    } });
    if (died) {
      await tx.botStateTransition.create({ data: { botId: bot.id, fromState: bot.status, toState: "PAUSED", reason: "SURVIVAL_OPERATING_COST_EXHAUSTED" } });
      await tx.botModeTransition.create({ data: { botId: bot.id, fromMode: bot.runMode, toMode: "OFF", reason: "SURVIVAL_OPERATING_COST_EXHAUSTED" } });
    }
    return { charged: new Prisma.Decimal(debit.chargedAmount).gt(0), skipped: false, died };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Charges each living bot once for the current New York billing month. */
export async function allocateMonthlyOperatingCosts(db: PrismaClient = prisma, now = new Date()) {
  const settings = await db.operatingCostSettings.findUnique({ where: { scope: "global" } });
  if (!settings?.enabled || settings.monthlyCost.lte(0)) return { enabled: false, chargedBots: 0, skippedBots: 0, diedBots: 0 };
  const bots = await db.botInstance.findMany({ where: { lifeStatus: "ACTIVE" }, select: { id: true, currentCapital: true } });
  const allocations = allocateMonthlyOperatingCost({ monthlyCost: settings.monthlyCost.toString(), bots: bots.map((bot) => ({ id: bot.id, currentCapital: bot.currentCapital.toString() })) });
  const billingMonth = monthlyOperatingCostBillingMonth(now);
  let chargedBots = 0; let skippedBots = 0; let diedBots = 0;
  for (const allocation of allocations) {
    const outcome = await chargeOneBot({ ...allocation, monthlyCost: settings.monthlyCost.toString(), billingMonth }, db);
    if (outcome.charged) chargedBots += 1;
    if (outcome.skipped) skippedBots += 1;
    if (outcome.died) diedBots += 1;
  }
  return { enabled: true, chargedBots, skippedBots, diedBots };
}
