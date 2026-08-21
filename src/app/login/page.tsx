import { redirect } from "next/navigation";
import { currentUser } from "@/modules/auth/session";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.mustChangePassword ? "/account/password" : "/");
  return <main className="authShell"><LoginForm /></main>;
}
