import { describe, expect, it } from "vitest";
import { aiRuntimeAllowsAdvisory, isQuotaDisabled } from "./ai-runtime-state";

describe("AI runtime budget circuit", () => {
  it("blocks advisory calls only after a durable quota pause, while preserving deterministic trading", () => {
    expect(aiRuntimeAllowsAdvisory({ featureEnabled: true, status: "ACTIVE" })).toBe(true);
    expect(aiRuntimeAllowsAdvisory({ featureEnabled: false, status: "ACTIVE" })).toBe(false);
    expect(aiRuntimeAllowsAdvisory({ featureEnabled: true, status: "QUOTA_EXHAUSTED" })).toBe(false);
    expect(isQuotaDisabled("QUOTA_EXHAUSTED")).toBe(true);
    expect(isQuotaDisabled("ACTIVE")).toBe(false);
  });
});
