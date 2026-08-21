import { randomUUID } from "node:crypto";
import { JobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const LEASE_MS = 60_000;

export async function ensureTask(name: string, cronExpression: string, timezone = "America/New_York") {
  return prisma.scheduledTask.upsert({ where: { name }, create: { name, cronExpression, timezone }, update: {} });
}

export async function runTask(taskName: string, handler: () => Promise<void>) {
  const task = await prisma.scheduledTask.findUnique({ where: { name: taskName } });
  if (!task?.enabled) return;
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
  await prisma.jobRun.updateMany({ where: { status: JobStatus.RUNNING, leaseExpiresAt: { lt: new Date() } }, data: { status: JobStatus.PENDING, leaseToken: null, leaseExpiresAt: null } });
  await prisma.executionJob.updateMany({ where: { status: JobStatus.RUNNING, leaseExpiresAt: { lt: new Date() } }, data: { status: JobStatus.PENDING, leaseToken: null, leaseExpiresAt: null } });
}
