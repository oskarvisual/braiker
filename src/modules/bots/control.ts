import { BotRunMode, BotStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateBotModeChange } from "@/modules/bots/bot-templates";

export type BotControl = "TURN_ON" | "TURN_OFF";

/**
 * The public control is intentionally binary. Survival protection remains
 * mandatory: turning a bot off also engages its kill switch.
 */
export function resolveBotPowerChange(action: BotControl) {
  return action === "TURN_ON"
    ? { runMode: BotRunMode.PAPER_ACTIVE, killSwitch: false }
    : { runMode: BotRunMode.OFF, killSwitch: true };
}

export async function applyBotControl(input: { botId: string; actorId: string; actorRole: UserRole; action: BotControl }) {
  return prisma.$transaction(async (tx) => {
    const bot = await tx.botInstance.findUnique({ where: { id: input.botId } });
    if (!bot) throw new Error("BOT_NOT_FOUND");
    if (input.actorRole !== "ADMIN") {
      const membership = await tx.walletMember.findUnique({ where: { walletId_userId: { walletId: bot.walletId, userId: input.actorId } } });
      if (!membership || membership.role === "VIEWER") throw new Error("FORBIDDEN");
    }

    if (bot.lifeStatus === "DEAD") throw new Error("BOT_DEAD");
    const { runMode: nextMode, killSwitch } = resolveBotPowerChange(input.action);
    const modeError = validateBotModeChange({ nextMode, killSwitch, status: bot.status, lifeStatus: bot.lifeStatus });
    if (modeError) throw new Error(modeError);
    const previousStatus = bot.status;
    const nextStatus = nextMode === BotRunMode.OFF ? BotStatus.PAUSED : BotStatus.RUNNING;
    const updated = await tx.botInstance.update({ where: { id: bot.id }, data: { runMode: nextMode, status: nextStatus, killSwitch } });
    if (bot.runMode !== nextMode) await tx.botModeTransition.create({ data: { botId: bot.id, fromMode: bot.runMode, toMode: nextMode, reason: input.action } });
    if (previousStatus !== nextStatus) await tx.botStateTransition.create({ data: { botId: bot.id, fromState: previousStatus, toState: nextStatus, reason: input.action } });
    await tx.auditLog.create({ data: { userId: input.actorId, walletId: bot.walletId, action: `BOT_${input.action}`, target: bot.id } });
    return updated;
  });
}
