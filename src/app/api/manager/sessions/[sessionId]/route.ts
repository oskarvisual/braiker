import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { archiveManagerConversation, renameManagerConversation } from "@/modules/manager-chat/manager-chat-service";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RENAME"), title: z.string().max(120) }),
  z.object({ action: z.literal("ARCHIVE") })
]);

export async function PATCH(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    assertSameOrigin(request);
    const [user, params, body] = await Promise.all([requireUser(), context.params, request.json()]);
    if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "MANAGER_SESSION_UPDATE_INVALID" }, { status: 400 });
    const session = parsed.data.action === "RENAME"
      ? await renameManagerConversation({ userId: user.id, sessionId: params.sessionId, title: parsed.data.title }, prisma)
      : await archiveManagerConversation({ userId: user.id, sessionId: params.sessionId }, prisma);
    return NextResponse.json({ session: { id: session.id, title: session.title, archivedAt: session.archivedAt?.toISOString() ?? null } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MANAGER_SESSION_UPDATE_FAILED";
    const status = code === "FORBIDDEN" ? 403 : code === "UNAUTHENTICATED" || code === "PASSWORD_CHANGE_REQUIRED" ? 401 : code === "MANAGER_SESSION_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: ["FORBIDDEN", "MANAGER_SESSION_NOT_FOUND", "MANAGER_OPERATIONS_SESSION_PROTECTED", "MANAGER_SESSION_TITLE_REQUIRED"].includes(code) ? code : "MANAGER_SESSION_UPDATE_FAILED" }, { status });
  }
}
