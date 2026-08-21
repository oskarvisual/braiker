import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const AI_RUNTIME_SCOPE = "global";
export type AiRuntimeStatus = "ACTIVE" | "QUOTA_EXHAUSTED";

export type AiRuntimeState = {
  status: AiRuntimeStatus;
  disabledAt: Date | null;
  lastCheckedAt: Date | null;
};

type AiRuntimeDb = Pick<PrismaClient, "aiRuntimeState">;

export function aiRuntimeAllowsAdvisory(input: { featureEnabled: boolean; status: AiRuntimeStatus }) {
  return input.featureEnabled && input.status === "ACTIVE";
}

export function isQuotaDisabled(status: AiRuntimeStatus) {
  return status === "QUOTA_EXHAUSTED";
}

export async function getAiRuntimeState(db: AiRuntimeDb = prisma): Promise<AiRuntimeState> {
  const state = await db.aiRuntimeState.findUnique({ where: { scope: AI_RUNTIME_SCOPE }, select: { status: true, disabledAt: true, lastCheckedAt: true } });
  if (!state) return { status: "ACTIVE", disabledAt: null, lastCheckedAt: null };
  return { status: state.status as AiRuntimeStatus, disabledAt: state.disabledAt, lastCheckedAt: state.lastCheckedAt };
}

/** A provider quota/billing denial pauses advisory calls globally; deterministic strategy and risk remain available. */
export async function disableAiRuntimeForQuota(now = new Date(), db: AiRuntimeDb = prisma) {
  return db.aiRuntimeState.upsert({
    where: { scope: AI_RUNTIME_SCOPE },
    create: { scope: AI_RUNTIME_SCOPE, status: "QUOTA_EXHAUSTED", disabledAt: now, lastCheckedAt: now, lastError: "OPENAI_QUOTA_EXHAUSTED" },
    update: { status: "QUOTA_EXHAUSTED", disabledAt: now, lastCheckedAt: now, lastError: "OPENAI_QUOTA_EXHAUSTED" }
  });
}

/** Only a successful, explicit availability check can reopen the provider circuit. */
export async function enableAiRuntimeAfterAvailabilityCheck(now = new Date(), db: AiRuntimeDb = prisma) {
  return db.aiRuntimeState.upsert({
    where: { scope: AI_RUNTIME_SCOPE },
    create: { scope: AI_RUNTIME_SCOPE, status: "ACTIVE", lastCheckedAt: now },
    update: { status: "ACTIVE", disabledAt: null, lastCheckedAt: now, lastError: null }
  });
}
