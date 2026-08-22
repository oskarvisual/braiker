import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { requireUser } from "@/modules/auth/session";
import { createManagerConversation, listManagerConversations } from "@/modules/manager-chat/manager-chat-service";
import { prisma } from "@/lib/prisma";

async function requireManagerUser() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

export async function GET() {
  try {
    const user = await requireManagerUser();
    const sessions = await listManagerConversations(user.id, prisma);

    return NextResponse.json(
      {
        sessions: sessions.map((session) => ({
          id: session.id,
          title: session.title,
          kind: session.kind,
          pinned: session.pinned,
          updatedAt: session.updatedAt.toISOString(),
          messages: session.messages.map((message) => ({
            id: message.id,
            role: message.role,
            source: message.source,
            content: message.content,
            createdAt: message.createdAt.toISOString()
          }))
        }))
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "MANAGER_SESSION_LIST_FAILED";
    const status = message === "FORBIDDEN" ? 403 : message === "UNAUTHENTICATED" || message === "PASSWORD_CHANGE_REQUIRED" ? 401 : 400;
    return NextResponse.json({ error: message === "FORBIDDEN" ? message : "MANAGER_SESSION_LIST_FAILED" }, { status });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireManagerUser();
    const body = await request.json() as { title?: unknown };
    const session = await createManagerConversation(user.id, typeof body.title === "string" ? body.title : "New conversation", prisma);
    return NextResponse.json({ session: { id: session.id, title: session.title, kind: session.kind, pinned: session.pinned, updatedAt: session.updatedAt.toISOString(), messages: [] } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MANAGER_SESSION_CREATE_FAILED";
    const status = message === "FORBIDDEN" ? 403 : message === "UNAUTHENTICATED" || message === "PASSWORD_CHANGE_REQUIRED" ? 401 : 400;
    return NextResponse.json({ error: message === "FORBIDDEN" ? message : "MANAGER_SESSION_CREATE_FAILED" }, { status });
  }
}
