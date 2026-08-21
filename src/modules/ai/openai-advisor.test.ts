import { describe, expect, it, vi } from "vitest";
import { OpenAiAdvisor, aiBlocksTrade, estimateOpenAiCost } from "@/modules/ai/openai-advisor";

const candidate = {
  symbol: "SPY",
  action: "BUY" as const,
  confidence: 82,
  strategyReason: "EMA9 above EMA21, positive momentum, elevated relative volume, and a bullish broad-market regime.",
  indicators: { ema9: 101, ema21: 100, rsi14: 58, atr14: 1.4, momentum5: 0.02, relativeVolume: 1.3 },
  marketRegime: "BULLISH",
  botInstruction: "Preserve capital before seeking returns."
};

describe("OpenAI trade advisor", () => {
  it("uses a non-stored structured Responses request and does not grant execution authority", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ recommendation: "PROCEED", rationale: "Trend and market regime align.", risks: ["Momentum can reverse."], evidence: ["EMA alignment"] }) }] }],
      usage: { input_tokens: 400, output_tokens: 100 }
    }), { status: 200 }));
    const advisor = new OpenAiAdvisor({ apiKey: "test-key", model: "gpt-5.4-mini", timeoutMs: 1_000, fetchImpl });

    const result = await advisor.analyze(candidate);

    expect(result).toMatchObject({ recommendation: "PROCEED", inputTokens: 400, outputTokens: 100 });
    expect(aiBlocksTrade(result)).toBe(false);
    const [, request] = fetchImpl.mock.calls[0];
    expect(request.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(request.body)).toMatchObject({ model: "gpt-5.4-mini", store: false, text: { format: { type: "json_schema" } } });
  });

  it("fails closed for malformed model output and never converts a failed analysis into approval", async () => {
    const advisor = new OpenAiAdvisor({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      timeoutMs: 1_000,
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not-json" }] }] }), { status: 200 }))
    });

    await expect(advisor.analyze(candidate)).rejects.toThrow("OPENAI_INVALID_RESPONSE");
    expect(aiBlocksTrade({ recommendation: "REJECT" })).toBe(true);
  });

  it("rejects incomplete and timed-out provider responses without treating them as advice", async () => {
    const incomplete = new OpenAiAdvisor({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      timeoutMs: 1_000,
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "in_progress", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ recommendation: "PROCEED", rationale: "Incomplete", risks: [], evidence: [] }) }] }] }), { status: 200 }))
    });
    const timeout = new OpenAiAdvisor({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      timeoutMs: 1_000,
      fetchImpl: vi.fn().mockRejectedValue(Object.assign(new Error("request timed out"), { name: "TimeoutError" }))
    });

    await expect(incomplete.analyze(candidate)).rejects.toThrow("OPENAI_INCOMPLETE_RESPONSE");
    await expect(timeout.analyze(candidate)).rejects.toThrow("OPENAI_TIMEOUT");
  });

  it("records provider rejection as a failed advisory, never as approval", async () => {
    const advisor = new OpenAiAdvisor({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      timeoutMs: 1_000,
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }))
    });

    await expect(advisor.analyze(candidate)).rejects.toThrow("OPENAI_REQUEST_FAILED_429");
  });

  it("classifies a provider quota or billing limit without treating it as ordinary rate limiting", async () => {
    const advisor = new OpenAiAdvisor({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      timeoutMs: 1_000,
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota." } }), { status: 429 }))
    });

    await expect(advisor.analyze(candidate)).rejects.toThrow("OPENAI_QUOTA_EXHAUSTED");
  });

  it("uses a tiny non-trading request to confirm that advisory access is available before a manual re-enable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed" }), { status: 200 }));
    const advisor = new OpenAiAdvisor({ apiKey: "test-key", model: "gpt-5.4-mini", timeoutMs: 1_000, fetchImpl });

    await expect(advisor.checkAvailability()).resolves.toBeUndefined();

    const [, request] = fetchImpl.mock.calls[0];
    expect(JSON.parse(request.body)).toMatchObject({ model: "gpt-5.4-mini", store: false, max_output_tokens: 16 });
    expect(JSON.parse(request.body).input).toContain("READY");
  });

  it("keeps the quota circuit closed when the manual availability check receives a quota rejection", async () => {
    const advisor = new OpenAiAdvisor({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      timeoutMs: 1_000,
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "billing_hard_limit_reached" } }), { status: 429 }))
    });

    await expect(advisor.checkAvailability()).rejects.toThrow("OPENAI_QUOTA_EXHAUSTED");
  });

  it("calculates persisted cost with Decimal arithmetic rather than JavaScript money floats", () => {
    expect(estimateOpenAiCost({ inputTokens: 400, outputTokens: 100 }).toString()).toBe("0.00075");
  });
});
