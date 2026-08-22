import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SCOPE = "global";

type WorkerRuntimeDb = Pick<PrismaClient, "workerRuntimeState">;

/** Durable cross-process liveness state. Never use a container-local file for this. */
export async function recordWorkerHeartbeat(input: { instanceId: string; startedAt: Date; now?: Date }, db: WorkerRuntimeDb = prisma) {
  const heartbeatAt = input.now ?? new Date();
  return db.workerRuntimeState.upsert({
    where: { scope: SCOPE },
    create: { scope: SCOPE, instanceId: input.instanceId, startedAt: input.startedAt, heartbeatAt },
    update: { instanceId: input.instanceId, startedAt: input.startedAt, heartbeatAt }
  });
}

export async function currentWorkerHeartbeat(db: WorkerRuntimeDb = prisma) {
  const state = await db.workerRuntimeState.findUnique({ where: { scope: SCOPE }, select: { heartbeatAt: true } });
  return state?.heartbeatAt ?? null;
}
