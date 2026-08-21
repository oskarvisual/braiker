import { beforeEach, describe, expect, it, vi } from "vitest";

const getSystemStatus = vi.fn();
vi.mock("@/modules/monitoring/system-status", () => ({ getSystemStatus }));

describe("GET /api/status", () => {
  beforeEach(() => {
    getSystemStatus.mockResolvedValue({
      checkedAt: new Date("2026-08-21T12:00:00.000Z"),
      bots: { on: 1, off: 2, dead: 0 },
      services: [{ id: "web", label: "Web application", state: "healthy", detail: "Serving status." }]
    });
  });

  it("returns a public, no-store JSON health payload without requiring a session", async () => {
    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ status: "healthy", bots: { on: 1, off: 2, dead: 0 } });
  });
});
