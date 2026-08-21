"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm({ email, required }: { email: string; required: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null);
    const response = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, nextPassword }) });
    if (!response.ok) { const body = await response.json(); setError(body.error ?? "Unable to update password"); setLoading(false); return; }
    router.replace("/"); router.refresh();
  }
  return <section className="authCard"><p className="eyebrow">ACCOUNT SECURITY</p><h1>{required ? "Choose a new password" : "Change password"}</h1><p className="muted">{email}. Use at least 12 characters with upper-case, lower-case, and a number.</p><form onSubmit={submit}><label>Current password<input autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label>New password<input autoComplete="new-password" type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} required /></label>{error && <p className="formError" role="alert">{error}</p>}<button type="submit" disabled={loading}>{loading ? "Updating…" : "Save password"}</button></form></section>;
}
