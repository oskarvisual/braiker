import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";

const money = z.string().regex(/^\d+(\.\d{1,12})?$/);
const schema = z.object({ enabled: z.boolean(), monthlyCost: money }).superRefine((value, context) => {
  if (value.enabled && !/[1-9]/.test(value.monthlyCost)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Monthly cost required" });
});

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_OPERATING_COST_SETTINGS" }, { status: 400 });
    const settings = await prisma.operatingCostSettings.upsert({
      where: { scope: "global" },
      create: { scope: "global", enabled: parsed.data.enabled, monthlyCost: parsed.data.monthlyCost },
      update: { enabled: parsed.data.enabled, monthlyCost: parsed.data.monthlyCost }
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "OPERATING_COST_SETTINGS_UPDATED", target: "global", metadata: { enabled: settings.enabled, monthlyCost: settings.monthlyCost.toString() } } });
    return NextResponse.json({ enabled: settings.enabled, monthlyCost: settings.monthlyCost.toString() });
  } catch {
    return NextResponse.json({ error: "OPERATING_COST_SETTINGS_UPDATE_FAILED" }, { status: 400 });
  }
}
