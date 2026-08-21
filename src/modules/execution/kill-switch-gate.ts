import type { BotStatus } from "@prisma/client";

export function canSubmitWithKillSwitch(input: { killSwitch: boolean; status: BotStatus; riskApproved: boolean }) {
  if (input.killSwitch) return { allowed: false as const, reason: "KILL_SWITCH" };
  if (input.status !== "RUNNING") return { allowed: false as const, reason: "BOT_NOT_RUNNING" };
  if (!input.riskApproved) return { allowed: false as const, reason: "RISK_NOT_APPROVED" };
  return { allowed: true as const };
}
