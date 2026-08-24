import { env } from "@/lib/env";
import { OpenAiAdvisor } from "@/modules/ai/openai-advisor";
import { disableAiRuntimeForQuota, enableAiRuntimeAfterAvailabilityCheck } from "@/modules/ai/ai-runtime-state";
import { observeOpenAiQuotaExhausted, resolveOpenAiQuotaAlert } from "@/modules/notifications/operational-alerts";

type ReactivationDependencies = {
  checkAvailability: () => Promise<void>;
  markActive: () => Promise<unknown>;
  resolveQuotaAlert: () => Promise<unknown>;
  markQuotaDisabled: () => Promise<unknown>;
  observeQuotaAlert: () => Promise<unknown>;
};

export type AiRuntimeReactivationResult = { status: "ACTIVE" | "QUOTA_EXHAUSTED" | "UNCONFIRMED" };

/** The action sends one small non-trading request; it never guesses an OpenAI account balance. */
export async function attemptAiRuntimeReactivation(overrides: Partial<ReactivationDependencies> = {}): Promise<AiRuntimeReactivationResult> {
  const dependencies: ReactivationDependencies = {
    checkAvailability: overrides.checkAvailability ?? (() => {
      const runtime = env();
      return new OpenAiAdvisor({ apiKey: runtime.OPENAI_API_KEY, model: runtime.OPENAI_MODEL, timeoutMs: runtime.OPENAI_TIMEOUT_MS }).checkAvailability();
    }),
    markActive: overrides.markActive ?? (() => enableAiRuntimeAfterAvailabilityCheck()),
    resolveQuotaAlert: overrides.resolveQuotaAlert ?? (() => resolveOpenAiQuotaAlert()),
    markQuotaDisabled: overrides.markQuotaDisabled ?? (() => disableAiRuntimeForQuota()),
    observeQuotaAlert: overrides.observeQuotaAlert ?? (() => observeOpenAiQuotaExhausted())
  };
  try {
    await dependencies.checkAvailability();
    await dependencies.markActive();
    await dependencies.resolveQuotaAlert();
    return { status: "ACTIVE" };
  } catch (error) {
    if (error instanceof Error && error.message === "OPENAI_QUOTA_EXHAUSTED") {
      await dependencies.markQuotaDisabled();
      await dependencies.observeQuotaAlert();
      return { status: "QUOTA_EXHAUSTED" };
    }
    return { status: "UNCONFIRMED" };
  }
}
