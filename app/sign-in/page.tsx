"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/src/auth/auth-client";
import { postSignInDestination } from "@/src/auth/signin-target";

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

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed");
        return;
      }
      router.push(postSignInDestination(window.location.search));
      router.refresh();
    } catch {
      // A sleeping free-tier host or transient network error should leave
      // the sign-in form usable, without exposing credentials in diagnostics.
      setError("Sign-in temporarily unavailable. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">MG</div>
        <p className="eyebrow">MandateGate</p>
        <h1>Financial authority stays here.</h1>
        <p className="muted">Authorized demo and restricted judge access. Public sign-up is disabled.</p>
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
