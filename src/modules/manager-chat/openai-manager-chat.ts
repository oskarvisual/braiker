import { buildManagerInstructions, sanitizeManagerMessage } from "./manager-chat";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_REPLY_LENGTH = 4_000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type ManagerChatHistoryItem = { role: "user" | "assistant"; content: string };
export type ManagerChatRequest = { message: string; context: Record<string, unknown>; history: ManagerChatHistoryItem[] };

function providerReportedQuota(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const type = (error as { type?: unknown }).type;
  return code === "insufficient_quota" || code === "billing_hard_limit_reached" || type === "insufficient_quota";
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

/** Read-only OpenAI adapter for the global Bot Manager; it is never used by trading execution. */
export class OpenAiManagerChat {
  constructor(private readonly config: { apiKey: string; model: string; timeoutMs: number; fetchImpl?: FetchLike }) {}

  async reply(request: ManagerChatRequest) {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(this.config.timeoutMs),
        body: JSON.stringify({
          model: this.config.model,
          store: false,
          instructions: buildManagerInstructions(request.context),
          input: [
            ...request.history.slice(-11).map((item) => ({ role: item.role, content: sanitizeManagerMessage(item.content) })),
            { role: "user", content: sanitizeManagerMessage(request.message) }
          ],
          max_output_tokens: 600
        })
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("OPENAI_TIMEOUT");
      throw new Error("OPENAI_REQUEST_FAILED");
    }
    if (!response.ok) {
      let payload: unknown = null;
      try { payload = await response.json(); } catch { /* provider response stays opaque */ }
      if (providerReportedQuota(payload)) throw new Error("OPENAI_QUOTA_EXHAUSTED");
      throw new Error(`OPENAI_REQUEST_FAILED_${response.status}`);
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || (payload as { status?: unknown }).status !== "completed") throw new Error("OPENAI_INCOMPLETE_RESPONSE");
    return sanitizeManagerMessage(responseText(payload)).slice(0, MAX_REPLY_LENGTH);
  }
}
