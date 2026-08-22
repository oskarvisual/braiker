import { randomUUID } from "node:crypto";
import { JobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isTaskRunDue } from "@/modules/scheduler/schedule-policy";

const LEASE_MS = 60_000;
const LEASE_RECOVERY_MAX_ATTEMPTS = 3;

function isRetryableWriteConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

/**
 * Lease recovery only performs idempotent conditional updates. MySQL can still
 * abort a concurrent update with P2034, so retry that transient conflict a few
 * times instead of marking the scheduler unhealthy.
 */
export async function retryLeaseRecoveryWrite<T>(operation: () => Promise<T>, pause: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      if (!isRetryableWriteConflict(error) || attempt >= LEASE_RECOVERY_MAX_ATTEMPTS) throw error;
      await pause(attempt * 100);
    }
  }
}

export async function ensureTask(name: string, cronExpression: string, timezone = "America/New_York") {
  return prisma.scheduledTask.upsert({ where: { name }, create: { name, cronExpression, timezone }, update: {} });
}

export async function runTask(taskName: string, handler: () => Promise<void>) {
  const task = await prisma.scheduledTask.findUnique({ where: { name: taskName } });
  if (!task?.enabled || !isTaskRunDue(task.nextRunAt)) return;
  const scheduledFor = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const run = await prisma.jobRun.upsert({
    where: { taskId_scheduledFor: { taskId: task.id, scheduledFor } },
    create: { taskId: task.id, scheduledFor },
    update: {}
  });
  const leaseToken = randomUUID();
  const claim = await prisma.jobRun.updateMany({
    where: { id: run.id, status: JobStatus.PENDING },
    data: { status: JobStatus.RUNNING, attempts: { increment: 1 }, leaseToken, leaseExpiresAt: new Date(Date.now() + LEASE_MS), startedAt: new Date() }
  });
  if (claim.count !== 1) return;
  try {
    await handler();
    await prisma.jobRun.updateMany({ where: { id: run.id, leaseToken }, data: { status: JobStatus.COMPLETED, completedAt: new Date(), leaseExpiresAt: null } });
  } catch (error) {
    logger.error({ err: error, taskName, jobId: run.id }, "Scheduled task failed");
    await prisma.jobRun.updateMany({ where: { id: run.id, leaseToken }, data: { status: JobStatus.FAILED, error: error instanceof Error ? error.message : "unknown", leaseExpiresAt: null } });
  }
}

export async function expireLeases() {
  await retryLeaseRecoveryWrite(async () => {
    const now = new Date();
    await prisma.jobRun.updateMany({ where: { status: JobStatus.RUNNING, leaseExpiresAt: { lt: now } }, data: { status: JobStatus.PENDING, leaseToken: null, leaseExpiresAt: null } });
    await prisma.executionJob.updateMany({ where: { status: JobStatus.RUNNING, leaseExpiresAt: { lt: now } }, data: { status: JobStatus.PENDING, leaseToken: null, leaseExpiresAt: null } });
  });
}
