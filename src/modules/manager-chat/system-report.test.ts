import { describe, expect, it } from "vitest";
import { buildManagerSystemReport, isSystemReportRequest } from "./system-report";

describe("Manager system report", () => {
  it("recognizes explicit English, Spanish, and slash-command system-report requests", () => {
    expect(isSystemReportRequest("system report")).toBe(true);
    expect(isSystemReportRequest("reporte de sistema")).toBe(true);
    expect(isSystemReportRequest("/status")).toBe(true);
    expect(isSystemReportRequest("/report")).toBe(true);
    expect(isSystemReportRequest("why did Bob skip?")).toBe(false);
  });

  it("combines the current safe status checks with the daily operating summary", () => {
    const message = buildManagerSystemReport({
      checkedAt: new Date("2026-08-21T12:00:00.000Z"),
      bots: { on: 2, off: 1, dead: 0 },
      openAi: { quotaPaused: false, reactivationAllowed: false },
      services: [
        { id: "database", label: "MySQL database", state: "healthy", detail: "Connected and responding." },
        { id: "worker", label: "Worker", state: "warning", detail: "Heartbeat is stale (3 minutes ago)." },
      ],
    }, "Daily paper-only report for 2026-08-21.\nBot scans: 4 completed.");

    expect(message).toContain("System report");
    expect(message).toContain("MySQL database: HEALTHY — Connected and responding.");
    expect(message).toContain("Worker: WARNING — Heartbeat is stale");
    expect(message).toContain("Daily operating report:\nDaily paper-only report");
    expect(message).not.toContain("password");
  });
});
