import { describe, expect, it, vi } from "vitest";
import { OpenAiManagerChat } from "./openai-manager-chat";

describe("OpenAiManagerChat", () => {
  it("uses the configured mini model, disables provider storage, and returns a bounded reply", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      output: [{ content: [{ type: "output_text", text: "A concise read-only summary." }] }]
    }), { status: 200 }));
    const chat = new OpenAiManagerChat({ apiKey: "test-api-key", model: "gpt-5-mini", timeoutMs: 1_000, fetchImpl });

    await expect(chat.reply({ message: "What is the current status?", context: { bots: [] }, history: [] })).resolves.toBe("A concise read-only summary.");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({ body: expect.stringContaining('"model":"gpt-5-mini"') }));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ store: false, max_output_tokens: 600 });
  });

  it("maps quota denials to the global circuit-breaker signal without exposing provider details", async () => {
    const chat = new OpenAiManagerChat({
      apiKey: "test-api-key",
      model: "gpt-5-mini",
      timeoutMs: 1_000,
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 })
    });

    await expect(chat.reply({ message: "hello", context: {}, history: [] })).rejects.toThrow("OPENAI_QUOTA_EXHAUSTED");
  });
});
