import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { createManagerActionProposal } from "@/modules/manager-chat/manager-action-proposals";

const bodySchema = z.object({ botId: z.string().uuid(), action: z.enum(["TURN_ON", "TURN_OFF"]) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "MANAGER_ACTION_INVALID" }, { status: 400 });
    const proposal = await createManagerActionProposal({ ...body.data, userId: user.id, actorRole: user.role, requestedVia: "WEB" }, prisma);
    // Browser confirmation uses the authenticated session and proposal id; the
    // code is intentionally not exposed to browser JavaScript.
    return NextResponse.json({ id: proposal.id, action: body.data.action, expiresAt: proposal.expiresAt });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MANAGER_ACTION_FAILED";
    return NextResponse.json({ error: code === "FORBIDDEN" ? code : "MANAGER_ACTION_FAILED" }, { status: code === "FORBIDDEN" ? 403 : code === "UNAUTHENTICATED" || code === "PASSWORD_CHANGE_REQUIRED" ? 401 : 400 });
  }
}
