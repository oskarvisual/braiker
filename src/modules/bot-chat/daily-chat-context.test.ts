import { describe, expect, it } from "vitest";
import { appendCautiousDailyContext } from "./daily-chat-context";

describe("daily bot chat context", () => {
  it("can only append bounded caution to an existing immutable briefing", () => {
    const result = appendCautiousDailyContext(
      { executionPolicy: "Never relax risk.", recommendations: ["Defer around high-impact events"], citations: [] },
      [{ source: "USER_CHAT", content: "Avoid QQQ until the Fed release is understood." }]
    );

    expect(result?.executionPolicy).toContain("cannot create a signal");
    expect(result?.recommendations).toContain("Caution-only USER_CHAT context: Avoid QQQ until the Fed release is understood.");
  });

  it("does not manufacture a daily input when no immutable briefing exists", () => {
    expect(appendCautiousDailyContext(null, [{ source: "USER_CHAT", content: "Avoid QQQ." }])).toBeNull();
  });
});
