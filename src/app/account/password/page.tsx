import { redirect } from "next/navigation";
import { currentUser } from "@/modules/auth/session";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function PasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <main className="authShell"><ChangePasswordForm email={user.email} required={user.mustChangePassword} /></main>;
}
