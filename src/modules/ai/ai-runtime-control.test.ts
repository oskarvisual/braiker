import { describe, expect, it, vi } from "vitest";
import { attemptAiRuntimeReactivation } from "./ai-runtime-control";

describe("manual AI runtime reactivation", () => {
  it("only reopens advisory calls after the provider availability check succeeds", async () => {
    const markActive = vi.fn();
    const resolveQuotaAlert = vi.fn();
    const result = await attemptAiRuntimeReactivation({
      checkAvailability: async () => undefined,
      markActive,
      resolveQuotaAlert,
      markQuotaDisabled: vi.fn(),
      observeQuotaAlert: vi.fn()
    });

    expect(result).toEqual({ status: "ACTIVE" });
    expect(markActive).toHaveBeenCalledOnce();
    expect(resolveQuotaAlert).toHaveBeenCalledOnce();
  });

  it("keeps the advisory circuit closed when OpenAI still reports quota exhaustion", async () => {
    const markQuotaDisabled = vi.fn();
    const observeQuotaAlert = vi.fn();
    const result = await attemptAiRuntimeReactivation({
      checkAvailability: async () => { throw new Error("OPENAI_QUOTA_EXHAUSTED"); },
      markActive: vi.fn(),
      resolveQuotaAlert: vi.fn(),
      markQuotaDisabled,
      observeQuotaAlert
    });

    expect(result).toEqual({ status: "QUOTA_EXHAUSTED" });
    expect(markQuotaDisabled).toHaveBeenCalledOnce();
    expect(observeQuotaAlert).toHaveBeenCalledOnce();
  });

  it("does not activate advisory calls when availability cannot be verified", async () => {
    const markActive = vi.fn();
    const result = await attemptAiRuntimeReactivation({
      checkAvailability: async () => { throw new Error("OPENAI_TIMEOUT"); },
      markActive,
      resolveQuotaAlert: vi.fn(),
      markQuotaDisabled: vi.fn(),
      observeQuotaAlert: vi.fn()
    });

    expect(result).toEqual({ status: "UNCONFIRMED" });
    expect(markActive).not.toHaveBeenCalled();
  });
});
