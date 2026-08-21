import { describe, expect, it, vi } from "vitest";
import { runOperationalAlertCheck } from "./operational-monitor";

describe("operational alert monitor", () => {
  it("observes current service failures before dispatching durable alerts", async () => {
    const status = { services: [], bots: { on: 1, off: 0, dead: 0 }, checkedAt: new Date("2026-08-21T12:00:00.000Z") };
    const observe = vi.fn().mockResolvedValue([]);
    const dispatch = vi.fn().mockResolvedValue({ delivered: 1, failed: 0 });

    await expect(runOperationalAlertCheck({ getStatus: vi.fn().mockResolvedValue(status), observe, dispatch })).resolves.toEqual({ delivered: 1, failed: 0 });
    expect(observe).toHaveBeenCalledWith(status);
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
