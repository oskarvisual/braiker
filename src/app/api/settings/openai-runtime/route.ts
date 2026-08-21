import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { env } from "@/lib/env";
import { requireUser } from "@/modules/auth/session";
import { attemptAiRuntimeReactivation } from "@/modules/ai/ai-runtime-control";
import { getAiRuntimeState } from "@/modules/ai/ai-runtime-state";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    if (!env().AI_ENABLED) return NextResponse.json({ error: "AI_DISABLED_BY_ENVIRONMENT" }, { status: 409 });
    const [state, quotaAlert] = await Promise.all([
      getAiRuntimeState(),
      prisma.notificationAlert.count({ where: { dedupeKey: "openai:quota", status: "OPEN" } })
    ]);
    if (state.status !== "QUOTA_EXHAUSTED" && quotaAlert === 0) return NextResponse.json({ error: "OPENAI_RUNTIME_NOT_QUOTA_DISABLED" }, { status: 409 });
    const result = await attemptAiRuntimeReactivation();
    if (result.status === "ACTIVE") return NextResponse.json(result);
    return NextResponse.json({ error: result.status === "QUOTA_EXHAUSTED" ? "OPENAI_QUOTA_EXHAUSTED" : "OPENAI_AVAILABILITY_UNCONFIRMED" }, { status: 503 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHENTICATED" }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 });
  }
}
