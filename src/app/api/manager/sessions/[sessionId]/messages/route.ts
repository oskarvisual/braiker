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

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const [user, params] = await Promise.all([requireManagerUser(), context.params]);
    const session = await prisma.managerChatSession.findFirst({ where: { id: params.sessionId, userId: user.id }, select: { id: true } });
    if (!session) return NextResponse.json({ error: "MANAGER_SESSION_NOT_FOUND" }, { status: 404 });
    const before = new URL(request.url).searchParams.get("before");
    const rows = await prisma.managerChatMessage.findMany({ where: { sessionId: session.id }, ...(before ? { cursor: { id: before }, skip: 1 } : {}), orderBy: { createdAt: "desc" }, take: 51 });
    const hasMore = rows.length > 50;
    const messages = rows.slice(0, 50).reverse();
    return NextResponse.json({ messages: messages.map((message) => ({ id: message.id, role: message.role, source: message.source, content: message.content, createdAt: message.createdAt.toISOString() })), hasMore, nextCursor: hasMore ? messages[0]?.id ?? null : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MANAGER_MESSAGE_LIST_FAILED";
    const status = message === "FORBIDDEN" ? 403 : message === "UNAUTHENTICATED" || message === "PASSWORD_CHANGE_REQUIRED" ? 401 : 400;
    return NextResponse.json({ error: message === "FORBIDDEN" ? message : "MANAGER_MESSAGE_LIST_FAILED" }, { status });
  }
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
