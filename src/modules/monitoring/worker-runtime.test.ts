import { describe, expect, it, vi } from "vitest";
import { currentWorkerHeartbeat, recordWorkerHeartbeat } from "./worker-runtime";

describe("durable worker runtime", () => {
  it("upserts a durable heartbeat that another process can read", async () => {
    const updatedAt = new Date("2026-08-22T14:00:00.000Z");
    const db = {
      workerRuntimeState: {
        upsert: vi.fn().mockResolvedValue({ heartbeatAt: updatedAt }),
        findUnique: vi.fn().mockResolvedValue({ heartbeatAt: updatedAt }),
      },
    };

    await recordWorkerHeartbeat({ instanceId: "worker-a", startedAt: updatedAt, now: updatedAt }, db as never);

    await expect(currentWorkerHeartbeat(db as never)).resolves.toEqual(updatedAt);
    expect(db.workerRuntimeState.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { scope: "global" },
      create: expect.objectContaining({ instanceId: "worker-a", heartbeatAt: updatedAt }),
    }));
  });
});
