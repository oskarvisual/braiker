import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { resolveManagerChatModel } from "@/modules/manager-chat/manager-chat";
import { OpenAiManagerChat } from "@/modules/manager-chat/openai-manager-chat";
import { createBotChatSession, sendBotChatMessage, type BotChatFocus } from "@/modules/bot-chat/bot-chat-service";

function parseFocus(value: unknown): BotChatFocus | null {
  if (!value || typeof value !== "object") return null;
  const focus = value as { kind?: unknown; id?: unknown };
  return (focus.kind === "ORDER" || focus.kind === "SCAN") && typeof focus.id === "string" && focus.id.length > 0 && focus.id.length <= 64
    ? { kind: focus.kind, id: focus.id }
    : null;
}

async function authorize(botId: string) {
  const user = await requireUser();
  const bot = await prisma.botInstance.findUnique({ where: { id: botId }, include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } } } });
  if (!bot || (user.role !== "ADMIN" && bot.wallet.members.length === 0)) throw new Error("BOT_NOT_FOUND");
  return user;
}

export async function GET(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    const { botId } = await context.params;
    const user = await authorize(botId);
    const bot = await prisma.botInstance.findUnique({ where: { id: botId }, select: { runMode: true, lifeStatus: true, status: true, killSwitch: true } });
    const sessions = await prisma.botChatSession.findMany({ where: { userId: user.id, botId }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, kind: true, createdAt: true, updatedAt: true } });
    const requestedSessionId = new URL(request.url).searchParams.get("sessionId");
    const selectedSession = sessions.find((session) => session.id === requestedSessionId) ?? sessions[0] ?? null;
    const messages = selectedSession ? await prisma.botChatMessage.findMany({ where: { sessionId: selectedSession.id }, orderBy: { createdAt: "asc" }, take: 100 }) : [];
    const active = Boolean(bot && bot.runMode === "PAPER_ACTIVE" && bot.lifeStatus === "ACTIVE" && bot.status === "RUNNING" && !bot.killSwitch);
    return NextResponse.json({ active, sessions: sessions.map((session) => ({ ...session, createdAt: session.createdAt.toISOString(), updatedAt: session.updatedAt.toISOString() })), selectedSessionId: selectedSession?.id ?? null, messages: messages.map((message) => ({ id: message.id, role: message.role, content: message.content, createdAt: message.createdAt.toISOString() })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOT_CHAT_FAILED";
    return NextResponse.json({ error: code === "BOT_NOT_FOUND" ? code : "BOT_CHAT_FAILED" }, { status: code === "UNAUTHENTICATED" || code === "PASSWORD_CHANGE_REQUIRED" ? 401 : code === "BOT_NOT_FOUND" ? 404 : 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    assertSameOrigin(request);
    const [params, body] = await Promise.all([context.params, request.json() as Promise<{ action?: unknown; content?: unknown; sessionId?: unknown; title?: unknown; focus?: unknown }>]);
    const user = await authorize(params.botId);
    if (body.action === "CREATE_SESSION") {
      const session = await createBotChatSession({ userId: user.id, botId: params.botId, title: typeof body.title === "string" ? body.title : undefined }, prisma);
      return NextResponse.json({ session: { id: session.id, title: session.title, kind: session.kind, createdAt: session.createdAt.toISOString(), updatedAt: session.updatedAt.toISOString() } });
    }
    if (body.action === "ASK_CONTEXT") {
      const focus = parseFocus(body.focus);
      if (typeof body.content !== "string" || !focus) return NextResponse.json({ error: "BOT_CHAT_CONTEXT_REQUIRED" }, { status: 400 });
      const session = await createBotChatSession({ userId: user.id, botId: params.botId, title: typeof body.title === "string" ? body.title : "Contextual explanation" }, prisma);
      const runtime = env();
      const responder = new OpenAiManagerChat({ apiKey: runtime.OPENAI_API_KEY, model: resolveManagerChatModel({ managerModel: runtime.BOT_MANAGER_CHAT_MODEL, defaultModel: runtime.OPENAI_MODEL }), timeoutMs: runtime.OPENAI_TIMEOUT_MS });
      const result = await sendBotChatMessage({ userId: user.id, botId: params.botId, sessionId: session.id, content: body.content, focus }, { db: prisma, responder, aiEnabled: runtime.AI_ENABLED && Boolean(runtime.OPENAI_API_KEY) });
      return NextResponse.json({ session: { id: session.id, title: session.title, kind: session.kind, createdAt: session.createdAt.toISOString(), updatedAt: session.updatedAt.toISOString() }, result });
    }
    if (typeof body.content !== "string" || typeof body.sessionId !== "string") return NextResponse.json({ error: "BOT_CHAT_MESSAGE_REQUIRED" }, { status: 400 });
    const runtime = env();
    const responder = new OpenAiManagerChat({ apiKey: runtime.OPENAI_API_KEY, model: resolveManagerChatModel({ managerModel: runtime.BOT_MANAGER_CHAT_MODEL, defaultModel: runtime.OPENAI_MODEL }), timeoutMs: runtime.OPENAI_TIMEOUT_MS });
    const result = await sendBotChatMessage({ userId: user.id, botId: params.botId, sessionId: body.sessionId, content: body.content }, { db: prisma, responder, aiEnabled: runtime.AI_ENABLED && Boolean(runtime.OPENAI_API_KEY) });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOT_CHAT_FAILED";
    return NextResponse.json({ error: ["BOT_NOT_FOUND", "BOT_CHAT_MESSAGE_EMPTY", "BOT_CHAT_SESSION_NOT_FOUND", "BOT_CHAT_REQUIRES_ACTIVE_BOT"].includes(code) ? code : "BOT_CHAT_FAILED" }, { status: code === "BOT_NOT_FOUND" ? 404 : 400 });
  }
}
