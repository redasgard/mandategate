"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/src/auth/auth-client";

export function JudgeSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSignOut = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Sign-out failed. Please retry.");
        return;
      }
      router.replace("/sign-in?returnTo=%2Fjudge");
      router.refresh();
    } catch {
      setError("Sign-out temporarily unavailable. Please retry.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="review-stage">
    <button type="button" onClick={() => void onSignOut()} disabled={busy}>
      {busy ? "Signing out…" : "End judge session"}
    </button>
    {error ? <p role="alert" className="error">{error}</p> : null}
  </div>;
}
