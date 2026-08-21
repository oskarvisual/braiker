"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!response.ok) { const body = await response.json(); setError(body.error ?? "Unable to sign in"); setLoading(false); return; }
    router.replace("/"); router.refresh();
  }
  return <section className="authCard"><p className="eyebrow">BRAIKER · PAPER ONLY</p><h1>Sign in</h1><p className="muted">Access the paper-trading control room.</p><form onSubmit={submit}><label>Email<input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="formError" role="alert">{error}</p>}<button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button></form></section>;
}
