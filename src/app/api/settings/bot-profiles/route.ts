import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { applyTemplateRiskLimits } from "@/modules/bots/bot-customization";
import { defaultRiskLimits, getConfiguredBotTemplate, listConfiguredBotTemplates } from "@/modules/bots/profile-defaults";
import { getBotTemplate } from "@/modules/bots/bot-templates";

const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const updateSchema = z.object({
  templateId: z.enum(["GUARDIAN", "NAVIGATOR", "EXPLORER"]),
  riskLimits: z.object({ maxPositionSize: money, maxDailyLoss: money, maxTradesPerDay: z.number().int().min(1) })
});

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await listConfiguredBotTemplates());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHENTICATED" }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 });
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const body = updateSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_PROFILE_DEFAULTS" }, { status: 400 });
    const base = getBotTemplate(body.data.templateId);
    const riskPolicy = applyTemplateRiskLimits(base.riskPolicy, body.data.riskLimits);
    const stored = await prisma.botProfileDefault.upsert({
      where: { templateId: body.data.templateId },
      create: { templateId: body.data.templateId, riskPolicy: defaultRiskLimits(riskPolicy) },
      update: { riskPolicy: defaultRiskLimits(riskPolicy) }
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "BOT_PROFILE_DEFAULTS_UPDATED", target: body.data.templateId, metadata: { riskLimits: stored.riskPolicy } } });
    return NextResponse.json(await getConfiguredBotTemplate(body.data.templateId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 });
  }
}
