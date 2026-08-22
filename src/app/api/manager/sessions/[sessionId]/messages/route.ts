import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { OpenAiManagerChat } from "@/modules/manager-chat/openai-manager-chat";
import { resolveManagerChatModel } from "@/modules/manager-chat/manager-chat";
import { sendManagerMessage } from "@/modules/manager-chat/manager-chat-service";
import { mirrorWebManagerExchangeToTelegram } from "@/modules/telegram/bot-manager";

async function requireManagerUser() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    assertSameOrigin(request);
    const [user, body, params] = await Promise.all([requireManagerUser(), request.json() as Promise<{ content?: unknown }>, context.params]);
    if (typeof body.content !== "string") return NextResponse.json({ error: "MANAGER_MESSAGE_REQUIRED" }, { status: 400 });
    const runtime = env();
    const responder = new OpenAiManagerChat({
      apiKey: runtime.OPENAI_API_KEY,
      model: resolveManagerChatModel({ managerModel: runtime.BOT_MANAGER_CHAT_MODEL, defaultModel: runtime.OPENAI_MODEL }),
      timeoutMs: runtime.OPENAI_TIMEOUT_MS
    });
    const result = await sendManagerMessage({ userId: user.id, sessionId: params.sessionId, content: body.content, actorRole: user.role, requestedVia: "WEB" }, { db: prisma, responder, aiEnabled: runtime.AI_ENABLED && Boolean(runtime.OPENAI_API_KEY) });
    // Telegram is an optional mirror. A delivery error must never make the
    // persisted browser conversation appear to have failed.
    const telegram = await mirrorWebManagerExchangeToTelegram({ userId: user.id, sessionId: params.sessionId, content: body.content, reply: result.reply })
      .catch(() => ({ mirrored: false }));
    const { actionProposal, ...response } = result;
    return NextResponse.json({
      ...response,
      ...(actionProposal ? { actionProposal: { id: actionProposal.id, botName: actionProposal.botName, action: actionProposal.action, expiresAt: actionProposal.expiresAt.toISOString() } } : {}),
      telegramMirrored: telegram.mirrored
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MANAGER_MESSAGE_FAILED";
    const status = message === "FORBIDDEN" ? 403 : message === "UNAUTHENTICATED" || message === "PASSWORD_CHANGE_REQUIRED" ? 401 : message === "MANAGER_SESSION_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: ["FORBIDDEN", "MANAGER_SESSION_NOT_FOUND", "MANAGER_MESSAGE_EMPTY"].includes(message) ? message : "MANAGER_MESSAGE_FAILED" }, { status });
  }
}
