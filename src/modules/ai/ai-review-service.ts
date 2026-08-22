import { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { aiReviewEligibility } from "@/modules/ai/ai-review-policy";
import { OpenAiAdvisor, type AiAdvisory, type AiCandidate } from "@/modules/ai/openai-advisor";
import { aiRuntimeAllowsAdvisory, disableAiRuntimeForQuota, getAiRuntimeState } from "@/modules/ai/ai-runtime-state";
import { observeOpenAiQuotaExhausted, resolveOpenAiQuotaAlert } from "@/modules/notifications/operational-alerts";

type AiReviewResult = { aiDecisionId?: string; advisory?: AiAdvisory; blocked: boolean; status: "DISABLED" | "LIMIT_REACHED" | "COMPLETED" | "FAILED" };

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Persists a redacted audit record for every attempted AI review. It never throws into the deterministic strategy path. */
export async function reviewTradeCandidateWithAi(input: { botId: string; candidate: AiCandidate }): Promise<AiReviewResult> {
  const runtime = env();
  const aiRuntime = await getAiRuntimeState();
  const enabled = aiRuntimeAllowsAdvisory({ featureEnabled: runtime.AI_ENABLED, status: aiRuntime.status });
  const analysesToday = enabled ? await prisma.aiDecision.count({ where: { botId: input.botId, createdAt: { gte: todayUtc() } } }) : 0;
  const eligibility = aiReviewEligibility({ enabled, analysesToday, dailyLimit: runtime.AI_MAX_ANALYSES_PER_BOT_PER_DAY });
  if (!eligibility.allowed) return { blocked: false, status: eligibility.reason === "AI_DISABLED" ? "DISABLED" : "LIMIT_REACHED" };
  const request = {
    symbol: input.candidate.symbol,
    action: input.candidate.action,
    deterministicConfidence: input.candidate.confidence,
    deterministicReason: input.candidate.strategyReason,
    indicators: input.candidate.indicators,
    marketRegime: input.candidate.marketRegime,
    botInstruction: input.candidate.botInstruction ?? null,
    dailyInput: input.candidate.dailyInput ?? null
  };
  try {
    const advisory = await new OpenAiAdvisor({ apiKey: runtime.OPENAI_API_KEY, model: runtime.OPENAI_MODEL, timeoutMs: runtime.OPENAI_TIMEOUT_MS }).analyze(input.candidate);
    const decision = await prisma.aiDecision.create({
      data: {
        botId: input.botId,
        provider: "openai",
        model: runtime.OPENAI_MODEL,
        request: request as Prisma.InputJsonValue,
        response: { recommendation: advisory.recommendation, rationale: advisory.rationale, risks: advisory.risks, evidence: advisory.evidence } as Prisma.InputJsonValue,
        inputTokens: advisory.inputTokens,
        outputTokens: advisory.outputTokens,
        costUsd: advisory.estimatedCostUsd
      }
    });
    await resolveOpenAiQuotaAlert();
    return { aiDecisionId: decision.id, advisory, blocked: advisory.recommendation === "REJECT", status: "COMPLETED" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OPENAI_UNKNOWN_ERROR";
    const decision = await prisma.aiDecision.create({ data: { botId: input.botId, provider: "openai", model: runtime.OPENAI_MODEL, request: request as Prisma.InputJsonValue, error: message } });
    if (message === "OPENAI_QUOTA_EXHAUSTED") {
      await disableAiRuntimeForQuota();
      await observeOpenAiQuotaExhausted();
    }
    return { aiDecisionId: decision.id, blocked: false, status: "FAILED" };
  }
}
