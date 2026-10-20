"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ExecutePaymentButton({ requestId, disabled, amountLabel }: { requestId: string; disabled: boolean; amountLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function execute() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/admin/payments/${encodeURIComponent(requestId)}/execute`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `HTTP_${response.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "PAYMENT_EXECUTION_FAILED");
    } finally { setBusy(false); }
  }

  return <div className="invoice-payment-action">
    <button type="button" className="invoice-primary-action" onClick={execute} disabled={disabled || busy}>
      {busy?"Submitting to PayPal…":amountLabel?`Pay ${amountLabel} with PayPal Sandbox →`:"Execute PayPal Sandbox payout →"}
    </button>
    {error?<p role="alert" className="error">{error}</p>:null}
  </div>;
}
