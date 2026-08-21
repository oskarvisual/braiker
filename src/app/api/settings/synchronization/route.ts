import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { reconciliationCron } from "@/modules/scheduler/schedule-policy";

const updateSchema = z.object({ enabled: z.boolean(), intervalMinutes: z.union([z.literal(1), z.literal(5), z.literal(15), z.literal(30), z.literal(60)]) });
const defaults = { enabled: true, intervalMinutes: 5, cronExpression: "*/5 * * * *", timezone: "America/New_York" };

export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const task = await prisma.scheduledTask.findUnique({ where: { name: "portfolio-reconciliation" } });
    return NextResponse.json(task ? { enabled: task.enabled, intervalMinutes: task.cronExpression === "0 * * * *" ? 60 : Number(task.cronExpression.match(/^\*\/(\d+)/)?.[1] ?? 5), cronExpression: task.cronExpression, timezone: task.timezone, updatedAt: task.updatedAt } : defaults);
  } catch { return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const body = updateSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid synchronization settings" }, { status: 400 });
    const task = await prisma.scheduledTask.upsert({
      where: { name: "portfolio-reconciliation" },
      create: { name: "portfolio-reconciliation", cronExpression: reconciliationCron(body.data.intervalMinutes), timezone: "America/New_York", enabled: body.data.enabled },
      update: { cronExpression: reconciliationCron(body.data.intervalMinutes), enabled: body.data.enabled }
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "PORTFOLIO_SYNC_SETTINGS_UPDATED", target: task.id, metadata: { enabled: task.enabled, intervalMinutes: body.data.intervalMinutes } } });
    return NextResponse.json({ enabled: task.enabled, intervalMinutes: body.data.intervalMinutes, cronExpression: task.cronExpression, timezone: task.timezone, updatedAt: task.updatedAt });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}
