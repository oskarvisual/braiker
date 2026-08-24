import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { archiveBotChatSession, renameBotChatSession } from "@/modules/bot-chat/bot-chat-service";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RENAME"), title: z.string().max(120) }),
  z.object({ action: z.literal("ARCHIVE") })
]);

async function authorize(botId: string) {
  const user = await requireUser();
  const bot = await prisma.botInstance.findUnique({ where: { id: botId }, include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } } } });
  if (!bot || (user.role !== "ADMIN" && bot.wallet.members.length === 0)) throw new Error("BOT_NOT_FOUND");
  return user;
}

export async function PATCH(request: Request, context: { params: Promise<{ botId: string; sessionId: string }> }) {
  try {
    assertSameOrigin(request);
    const [params, body] = await Promise.all([context.params, request.json()]);
    const [user, parsed] = await Promise.all([authorize(params.botId), Promise.resolve(bodySchema.safeParse(body))]);
    if (!parsed.success) return NextResponse.json({ error: "BOT_CHAT_SESSION_UPDATE_INVALID" }, { status: 400 });
    const session = parsed.data.action === "RENAME"
      ? await renameBotChatSession({ userId: user.id, botId: params.botId, sessionId: params.sessionId, title: parsed.data.title }, prisma)
      : await archiveBotChatSession({ userId: user.id, botId: params.botId, sessionId: params.sessionId }, prisma);
    return NextResponse.json({ session: { id: session.id, title: session.title, archivedAt: session.archivedAt?.toISOString() ?? null } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOT_CHAT_SESSION_UPDATE_FAILED";
    const status = code === "BOT_NOT_FOUND" ? 404 : code === "UNAUTHENTICATED" || code === "PASSWORD_CHANGE_REQUIRED" ? 401 : 400;
    return NextResponse.json({ error: ["BOT_NOT_FOUND", "BOT_CHAT_SESSION_NOT_FOUND", "BOT_CHAT_TITLE_REQUIRED"].includes(code) ? code : "BOT_CHAT_SESSION_UPDATE_FAILED" }, { status });
  }
}
