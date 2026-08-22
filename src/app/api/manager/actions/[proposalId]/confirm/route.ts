import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { confirmManagerActionProposal } from "@/modules/manager-chat/manager-action-proposals";

export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  try {
    assertSameOrigin(request);
    const [user, params] = await Promise.all([requireUser(), context.params]);
    const bot = await confirmManagerActionProposal({ proposalId: params.proposalId, actorId: user.id, actorRole: user.role, channel: "WEB" }, { db: prisma });
    return NextResponse.json({ id: bot.id, runMode: bot.runMode, status: bot.status, killSwitch: bot.killSwitch });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MANAGER_ACTION_FAILED";
    const status = code === "FORBIDDEN" ? 403 : code === "UNAUTHENTICATED" || code === "PASSWORD_CHANGE_REQUIRED" ? 401 : code === "MANAGER_ACTION_CONFIRMATION_INVALID" ? 409 : 400;
    return NextResponse.json({ error: ["FORBIDDEN", "MANAGER_ACTION_CONFIRMATION_INVALID", "BOT_DEAD", "BOT_NOT_FOUND"].includes(code) ? code : "MANAGER_ACTION_FAILED" }, { status });
  }
}
