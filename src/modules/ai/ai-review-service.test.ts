import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(), count: vi.fn(), create: vi.fn(), getRuntime: vi.fn(), disableForQuota: vi.fn(), observeQuota: vi.fn(), resolveQuota: vi.fn()
}));

vi.mock("@/lib/env", () => ({ env: () => ({ AI_ENABLED: true, AI_MAX_ANALYSES_PER_BOT_PER_DAY: 10, OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-5.4-mini", OPENAI_TIMEOUT_MS: 1_000 }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { aiDecision: { count: mocks.count, create: mocks.create } } }));
vi.mock("@/modules/ai/openai-advisor", () => ({ OpenAiAdvisor: class { analyze = mocks.analyze; } }));
vi.mock("@/modules/ai/ai-runtime-state", () => ({ aiRuntimeAllowsAdvisory: ({ featureEnabled, status }: { featureEnabled: boolean; status: string }) => featureEnabled && status === "ACTIVE", getAiRuntimeState: mocks.getRuntime, disableAiRuntimeForQuota: mocks.disableForQuota }));
vi.mock("@/modules/notifications/operational-alerts", () => ({ observeOpenAiQuotaExhausted: mocks.observeQuota, resolveOpenAiQuotaAlert: mocks.resolveQuota }));

import { reviewTradeCandidateWithAi } from "./ai-review-service";

const candidate = { symbol: "SPY", action: "BUY" as const, confidence: 80, strategyReason: "candidate", indicators: {}, marketRegime: "BULLISH" };

describe("AI review service budget circuit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRuntime.mockResolvedValue({ status: "ACTIVE" });
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({ id: "decision-1" });
  });

  it("does not call OpenAI at all while a quota pause is durable", async () => {
    mocks.getRuntime.mockResolvedValue({ status: "QUOTA_EXHAUSTED" });

    await expect(reviewTradeCandidateWithAi({ botId: "bot-1", candidate })).resolves.toEqual({ blocked: false, status: "DISABLED" });
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("persists the pause and opens the quota alert after a real provider quota rejection", async () => {
    mocks.analyze.mockRejectedValue(new Error("OPENAI_QUOTA_EXHAUSTED"));

    await expect(reviewTradeCandidateWithAi({ botId: "bot-1", candidate })).resolves.toMatchObject({ status: "FAILED", aiDecisionId: "decision-1" });
    expect(mocks.disableForQuota).toHaveBeenCalledOnce();
    expect(mocks.observeQuota).toHaveBeenCalledOnce();
    expect(mocks.resolveQuota).not.toHaveBeenCalled();
  });
});
