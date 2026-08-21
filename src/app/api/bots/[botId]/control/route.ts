import { NextResponse } from "next/server";
import { z } from "zod";
import { applyBotControl } from "@/modules/bots/control";
import { requireUser } from "@/modules/auth/session";
import { assertSameOrigin } from "@/lib/http";

const bodySchema = z.object({ action: z.enum(["TURN_ON", "TURN_OFF"]) });

export async function POST(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    const { botId } = await context.params;
    const bot = await applyBotControl({ botId, actorId: user.id, actorRole: user.role, action: body.data.action });
    return NextResponse.json({ id: bot.id, status: bot.status, runMode: bot.runMode, killSwitch: bot.killSwitch });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 400 });
  }
}
