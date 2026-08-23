import { createHash } from "node:crypto";
import type { RiskPolicy } from "@/modules/risk/types";
import type { AdaptiveRiskLevel } from "./adaptive-risk";

type AdjustmentInput = {
  botId: string;
  level: AdaptiveRiskLevel;
  reason: string;
  basePolicy: RiskPolicy;
  effectivePolicy: RiskPolicy;
};

type AdjustmentDb = {
  botRiskAdjustment: {
    findFirst(args: { where: { botId: string }; orderBy: { createdAt: "desc" }; select: { fingerprint: true } }): Promise<{ fingerprint: string } | null>;
    create(args: { data: AdjustmentInput & { fingerprint: string } }): Promise<unknown>;
  };
};

/** Stable identity for an effective posture. The reason may be explanatory,
 * but a new row is required only when limits or level actually change. */
export function adaptiveRiskFingerprint(input: Pick<AdjustmentInput, "level" | "basePolicy" | "effectivePolicy">) {
  return createHash("sha256").update(JSON.stringify({ level: input.level, basePolicy: input.basePolicy, effectivePolicy: input.effectivePolicy })).digest("hex");
}

export async function recordAdaptiveRiskAdjustment(input: AdjustmentInput, db: AdjustmentDb) {
  const fingerprint = adaptiveRiskFingerprint(input);
  const previous = await db.botRiskAdjustment.findFirst({ where: { botId: input.botId }, orderBy: { createdAt: "desc" }, select: { fingerprint: true } });
  if (previous?.fingerprint === fingerprint) return false;
  await db.botRiskAdjustment.create({ data: { ...input, fingerprint } });
  return true;
}
