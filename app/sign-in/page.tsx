"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/src/auth/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setError(result.error.message ?? "Sign-in failed");
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">MG</div>
        <p className="eyebrow">MandateGate</p>
        <h1>Financial authority stays here.</h1>
        <p className="muted">Synthetic hackathon admin access. Public sign-up is disabled.</p>
        <form onSubmit={submit} className="stack">
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? "Checking authority…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
