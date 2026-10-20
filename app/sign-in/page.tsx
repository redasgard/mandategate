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
    <main className="mg-login-page">
      <div className="mg-login-brand">
        <span className="mg-login-logo" aria-hidden="true">M</span>
        <span><strong>mandategate</strong><small>PAYMENT AUTHORITY</small></span>
      </div>
      <section className="mg-login-story" aria-label="MandateGate security model">
        <p className="mg-login-eyebrow">AUTONOMOUS PAYMENT SECURITY</p>
        <h1>Financial authority stays here.</h1>
        <p>Let agents do the work, while your trusted vendors, rules, and payment boundaries stay in control.</p>
        <div className="mg-login-steps" aria-label="Authority flow">
          <div><span>01</span><strong>Agent submits a request</strong></div>
          <div><span>02</span><strong>MandateGate evaluates risk</strong></div>
          <div><span>03</span><strong>Authorized payments proceed</strong></div>
        </div>
        <p className="mg-login-note">Invoices and model outputs are evidence, never payment authority.</p>
      </section>
      <section className="mg-login-panel" aria-label="Administrator sign-in">
        <div className="mg-login-card">
          <p className="mg-login-eyebrow">SECURE ACCESS</p>
          <h2>Welcome back</h2>
          <p className="mg-login-intro">Sign in to manage exceptions, payments, vendors and policies.</p>
          <form onSubmit={submit} className="mg-login-form">
            <label htmlFor="mg-login-email">Work email
              <input id="mg-login-email" name="email" type="email" required
                autoComplete="email" placeholder="name@company.com"/>
            </label>
            <label htmlFor="mg-login-password">Password
              <input id="mg-login-password" name="password" type="password"
                required autoComplete="current-password" placeholder="Enter your password"/>
            </label>
            {error ? <p role="alert" className="mg-login-error">{error}</p> : null}
            <button type="submit" disabled={busy}>
              {busy ? "Checking authority…" : "Sign in to MandateGate"} <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="mg-login-restriction">Authorized users only. Public sign-up is disabled.</p>
        </div>
      </section>
    </main>
  );
}
