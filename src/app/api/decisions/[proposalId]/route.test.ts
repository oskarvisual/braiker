import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const getDecisionReportForUser = vi.fn();

vi.mock("@/modules/auth/session", () => ({ requireUser }));
vi.mock("@/modules/decisions/decision-report-data", () => ({ getDecisionReportForUser }));

describe("GET /api/decisions/[proposalId]", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue({ id: "user-1", role: "ADMIN" });
    getDecisionReportForUser.mockResolvedValue({
      botName: "Navigator",
      action: "BUY",
      symbol: "QQQ",
      summary: "The report is available.",
      steps: [{ title: "Market snapshot", state: "complete", detail: "Captured." }],
      indicators: [{ name: "rsi14", value: "58" }],
      riskChecks: [{ rule: "KILL_SWITCH", passed: true, detail: "Enabled." }]
    });
  });

  it("returns the authorized decision report JSON for the shared modal", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/decisions/proposal-1"), { params: Promise.resolve({ proposalId: "proposal-1" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ botName: "Navigator", action: "BUY", symbol: "QQQ", steps: [{ title: "Market snapshot" }] });
    expect(getDecisionReportForUser).toHaveBeenCalledWith("proposal-1", { id: "user-1", role: "ADMIN" });
  });
});
