import { Prisma } from "@prisma/client";
import type { TradeAction } from "@/modules/domain/contracts";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const INPUT_USD_PER_MILLION_TOKENS = new Prisma.Decimal("0.75");
const OUTPUT_USD_PER_MILLION_TOKENS = new Prisma.Decimal("4.50");
const ONE_MILLION = new Prisma.Decimal("1000000");

export type AiRecommendation = "PROCEED" | "CAUTION" | "REJECT";

export type AiCandidate = {
  symbol: string;
  action: Exclude<TradeAction, "HOLD">;
  confidence: number;
  strategyReason: string;
  indicators: Record<string, number>;
  marketRegime: string;
  botInstruction?: string | null;
  /** Deterministic, source-free caution input generated before market open. */
  dailyInput?: { executionPolicy: string; recommendations: string[]; citations: Array<{ category: string; hostname: string; hash: string }> } | null;
};

export type AiAdvisory = {
  recommendation: AiRecommendation;
  rationale: string;
  risks: string[];
  evidence: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: Prisma.Decimal | null;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function isQuotaExhausted(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const type = (error as { type?: unknown }).type;
  return code === "insufficient_quota" || code === "billing_hard_limit_reached" || type === "insufficient_quota";
}

const advisorySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendation: { type: "string", enum: ["PROCEED", "CAUTION", "REJECT"] },
    rationale: { type: "string", maxLength: 600 },
    risks: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 5 },
    evidence: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 5 }
  },
  required: ["recommendation", "rationale", "risks", "evidence"]
} as const;

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function parseAdvisory(output: unknown): Omit<AiAdvisory, "inputTokens" | "outputTokens" | "estimatedCostUsd"> {
  if (!output || typeof output !== "object") throw new Error("OPENAI_INVALID_RESPONSE");
  const item = output as Record<string, unknown>;
  const recommendation = item.recommendation;
  const rationale = item.rationale;
  const risks = stringArray(item.risks);
  const evidence = stringArray(item.evidence);
  if (!(["PROCEED", "CAUTION", "REJECT"] as const).includes(recommendation as AiRecommendation) || typeof rationale !== "string" || !risks || !evidence) throw new Error("OPENAI_INVALID_RESPONSE");
  return { recommendation: recommendation as AiRecommendation, rationale, risks, evidence };
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") throw new Error("OPENAI_INVALID_RESPONSE");
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) throw new Error("OPENAI_INVALID_RESPONSE");
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    const text = content.find((part) => part && typeof part === "object" && (part as { type?: unknown }).type === "output_text");
    if (text && typeof (text as { text?: unknown }).text === "string") return (text as { text: string }).text;
  }
  throw new Error("OPENAI_INVALID_RESPONSE");
}

function usageTokens(payload: unknown) {
  const usage = payload && typeof payload === "object" ? (payload as { usage?: unknown }).usage : undefined;
  if (!usage || typeof usage !== "object") return { inputTokens: null, outputTokens: null };
  const inputTokens = (usage as { input_tokens?: unknown }).input_tokens;
  const outputTokens = (usage as { output_tokens?: unknown }).output_tokens;
  return { inputTokens: Number.isInteger(inputTokens) ? inputTokens as number : null, outputTokens: Number.isInteger(outputTokens) ? outputTokens as number : null };
}

export function estimateOpenAiCost({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }) {
  return new Prisma.Decimal(inputTokens).mul(INPUT_USD_PER_MILLION_TOKENS).plus(new Prisma.Decimal(outputTokens).mul(OUTPUT_USD_PER_MILLION_TOKENS)).div(ONE_MILLION);
}

/** AI may veto a candidate; it can never approve risk, modify a policy, or submit an order. */
export function aiBlocksTrade(advisory: Pick<AiAdvisory, "recommendation">) {
  return advisory.recommendation === "REJECT";
}

export class OpenAiAdvisor {
  constructor(private readonly config: { apiKey: string; model: string; timeoutMs: number; fetchImpl?: FetchLike }) {}

  /** A short, non-trading request used only after an administrator asks to re-enable a quota-paused provider. */
  async checkAvailability(): Promise<void> {
    const response = await this.responsesRequest({
      model: this.config.model,
      store: false,
      instructions: "You are a BrAIker provider availability check. Do not provide trading advice.",
      input: "Return READY.",
      max_output_tokens: 16
    });
    if (!response.ok) await this.throwProviderError(response);
  }

  private async responsesRequest(body: Record<string, unknown>) {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    try {
      return await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(this.config.timeoutMs),
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("OPENAI_TIMEOUT");
      throw new Error("OPENAI_REQUEST_FAILED");
    }
  }

  private async throwProviderError(response: Response): Promise<never> {
    let errorPayload: unknown = null;
    try { errorPayload = await response.json(); } catch { /* Keep the provider error opaque. */ }
    if (isQuotaExhausted(errorPayload)) throw new Error("OPENAI_QUOTA_EXHAUSTED");
    throw new Error(`OPENAI_REQUEST_FAILED_${response.status}`);
  }

  async analyze(candidate: AiCandidate): Promise<AiAdvisory> {
    const response = await this.responsesRequest({
          model: this.config.model,
          store: false,
          instructions: "You are BrAIker's advisory-only paper trading reviewer. Return English JSON only. You must not recommend a size, override a risk rule, or claim to approve an order. You may reject a deterministic candidate when its evidence is inadequate. A PROCEED or CAUTION response cannot authorize execution.",
          input: JSON.stringify({
            symbol: candidate.symbol,
            action: candidate.action,
            deterministicConfidence: candidate.confidence,
            deterministicReason: candidate.strategyReason,
            indicators: candidate.indicators,
            marketRegime: candidate.marketRegime,
            botInstruction: candidate.botInstruction ?? null,
            dailyInput: candidate.dailyInput ?? null
          }),
          max_output_tokens: 500,
          text: { format: { type: "json_schema", name: "braiker_trade_advisory", strict: true, schema: advisorySchema } }
    });
    if (!response.ok) await this.throwProviderError(response);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || (payload as { status?: unknown }).status !== "completed") throw new Error("OPENAI_INCOMPLETE_RESPONSE");
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(responseText(payload));
    } catch {
      throw new Error("OPENAI_INVALID_RESPONSE");
    }
    const parsed = parseAdvisory(parsedJson);
    const { inputTokens, outputTokens } = usageTokens(payload);
    return { ...parsed, inputTokens, outputTokens, estimatedCostUsd: inputTokens !== null && outputTokens !== null ? estimateOpenAiCost({ inputTokens, outputTokens }) : null };
  }
}
