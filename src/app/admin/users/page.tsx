import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/modules/auth/authorization";
import { currentUser } from "@/modules/auth/session";
import { UserManagement } from "@/components/user-management";
import { AppNavigation } from "@/components/app-navigation";

export default async function UsersPage() {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!canManageUsers(actor.role)) redirect("/");
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, role: true, mustChangePassword: true, createdAt: true } });
  return <><AppNavigation user={{ email: actor.email, role: actor.role }} /><main className="shell appContent"><UserManagement actorId={actor.id} initialUsers={users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() }))} /></main></>;
}
