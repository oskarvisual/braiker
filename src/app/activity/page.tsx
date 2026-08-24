import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { ActivityFeed } from "@/components/activity-feed";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/modules/auth/session";
import { listActivityHistory } from "@/modules/history/activity-history";

export default async function ActivityPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const history = await listActivityHistory({ userId: user.id, role: user.role }, prisma);
  if (!history.hasWallets) redirect("/");
  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><ActivityFeed orders={history.orders} bots={history.bots} wallets={history.wallets} /></main></>;
}
