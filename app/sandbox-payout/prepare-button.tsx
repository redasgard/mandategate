"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PrepareSandboxPayoutButton() {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const router = useRouter();
  const prepare = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sandbox-payout", {method:"POST"});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error??"SANDBOX_PREPARATION_FAILED");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "SANDBOX_PREPARATION_FAILED");
    } finally {setBusy(false);}
  };
  return <div>
    <button type="button" disabled={busy} onClick={() => void prepare()}>
      {busy ? "Preparing..." : "Prepare one fictional $1.01 payout request"}
    </button>
    {error?<p role="alert" className="error">{error}</p>:null}
  </div>;
}