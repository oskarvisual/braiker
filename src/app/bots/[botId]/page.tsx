import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { BotChat } from "@/components/bot-chat";
import { currentUser } from "@/modules/auth/session";
import { prisma } from "@/lib/prisma";

export default async function BotDetailPage({ params }: { params: Promise<{ botId: string }> }) {
  const [user, route] = await Promise.all([currentUser(), params]);
  if (!user) redirect("/login");
  const bot = await prisma.botInstance.findUnique({ where: { id: route.botId }, include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } } } });
  if (!bot || (user.role !== "ADMIN" && bot.wallet.members.length === 0)) redirect("/setup");
  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><BotChat botId={bot.id} botName={bot.name} /></main></>;
}
