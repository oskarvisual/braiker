import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { resolveManagerChatModel } from "@/modules/manager-chat/manager-chat";
import { OpenAiManagerChat } from "@/modules/manager-chat/openai-manager-chat";
import { createOrLoadBotChat, sendBotChatMessage } from "@/modules/bot-chat/bot-chat-service";

async function authorize(botId: string) {
  const user = await requireUser();
  const bot = await prisma.botInstance.findUnique({ where: { id: botId }, include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } } } });
  if (!bot || (user.role !== "ADMIN" && bot.wallet.members.length === 0)) throw new Error("BOT_NOT_FOUND");
  return user;
}

export async function GET(_: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    const { botId } = await context.params;
    const user = await authorize(botId);
    const session = await createOrLoadBotChat(user.id, botId, prisma);
    const messages = await prisma.botChatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" }, take: 100 });
    return NextResponse.json({ sessionId: session.id, messages: messages.map((message) => ({ id: message.id, role: message.role, content: message.content, createdAt: message.createdAt.toISOString() })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOT_CHAT_FAILED";
    return NextResponse.json({ error: code === "BOT_NOT_FOUND" ? code : "BOT_CHAT_FAILED" }, { status: code === "UNAUTHENTICATED" || code === "PASSWORD_CHANGE_REQUIRED" ? 401 : code === "BOT_NOT_FOUND" ? 404 : 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ botId: string }> }) {
  try {
    assertSameOrigin(request);
    const [params, body] = await Promise.all([context.params, request.json() as Promise<{ content?: unknown }>]);
    const user = await authorize(params.botId);
    if (typeof body.content !== "string") return NextResponse.json({ error: "BOT_CHAT_MESSAGE_REQUIRED" }, { status: 400 });
    const runtime = env();
    const responder = new OpenAiManagerChat({ apiKey: runtime.OPENAI_API_KEY, model: resolveManagerChatModel({ managerModel: runtime.BOT_MANAGER_CHAT_MODEL, defaultModel: runtime.OPENAI_MODEL }), timeoutMs: runtime.OPENAI_TIMEOUT_MS });
    const result = await sendBotChatMessage({ userId: user.id, botId: params.botId, content: body.content }, { db: prisma, responder, aiEnabled: runtime.AI_ENABLED && Boolean(runtime.OPENAI_API_KEY) });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOT_CHAT_FAILED";
    return NextResponse.json({ error: ["BOT_NOT_FOUND", "BOT_CHAT_MESSAGE_EMPTY"].includes(code) ? code : "BOT_CHAT_FAILED" }, { status: code === "BOT_NOT_FOUND" ? 404 : 400 });
  }
}
