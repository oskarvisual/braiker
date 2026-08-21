import { redirect } from "next/navigation";
import { currentUser } from "@/modules/auth/session";
import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/modules/dashboard/dashboard-data";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");
  return <Dashboard user={{ email: user.email, role: user.role }} data={await getDashboardData(user)} />;
}
