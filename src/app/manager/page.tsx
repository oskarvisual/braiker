import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { ManagerChat } from "@/components/manager-chat";
import { currentUser } from "@/modules/auth/session";
import { listManagerConversations } from "@/modules/manager-chat/manager-chat-service";
import { prisma } from "@/lib/prisma";

export default async function ManagerPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  const sessions = await listManagerConversations(user.id, prisma);
  return <>
    <AppNavigation user={{ email: user.email, role: user.role }} />
    <main className="shell appContent">
      <ManagerChat initialSessions={sessions.map((session) => ({
        id: session.id,
        title: session.title,
        kind: session.kind,
        pinned: session.pinned,
        updatedAt: session.updatedAt.toISOString(),
        messages: session.messages.map((message) => ({ id: message.id, role: message.role, source: message.source, content: message.content, createdAt: message.createdAt.toISOString() }))
      }))} />
    </main>
  </>;
}
