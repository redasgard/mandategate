"use client";

import { useState } from "react";

type Case = { id: string; title: string; expectedOutcome: "ALLOW" | "ESCALATE" | "DENY" };
type Result = {
  id: string;
  outcome: "ALLOW" | "ESCALATE" | "DENY";
  reasonCodes: string[];
  proofClass: "DETERMINISTIC_POLICY_SIMULATION";
  noPaymentPerformed: true;
  noDatabaseMutation: true;
  aiInvoiceDerived: false;
};

/** The only browser action is an authenticated GET, never a payment POST. */
export function JudgeScenarioReplay({ cases }: { cases: Case[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});

  async function replay(item: Case) {
    if (busy) return;
    setBusy(item.id);
    setError(null);
    try {
      const response = await fetch("/api/judge/scenario?case=" + encodeURIComponent(item.id), {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const code = typeof body === "object" && body !== null && "error" in body
          ? String(body.error) : "JUDGE_SCENARIO_FAILED";
        throw new Error(code);
      }
      if (typeof body !== "object" || body === null ||
        !("id" in body) || body.id !== item.id ||
        !("outcome" in body) || body.outcome !== item.expectedOutcome ||
        !("reasonCodes" in body) || !Array.isArray(body.reasonCodes) ||
        !body.reasonCodes.every(x => typeof x === "string") ||
        !("proofClass" in body) || body.proofClass !== "DETERMINISTIC_POLICY_SIMULATION" ||
        !("noPaymentPerformed" in body) || body.noPaymentPerformed !== true ||
        !("noDatabaseMutation" in body) || body.noDatabaseMutation !== true ||
        !("aiInvoiceDerived" in body) || body.aiInvoiceDerived !== false) {
        throw new Error("JUDGE_DECISION_EVIDENCE_MISMATCH");
      }
      setResults(previous => ({ ...previous, [item.id]: body as Result }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "JUDGE_SCENARIO_FAILED");
    } finally {
      setBusy(null);
    }
  }

  return <section className="review-stage" aria-label="Judge policy sandbox">
    <p className="eyebrow">Try it / zero-payment policy evaluation</p>
    <h2>Run the actual deterministic decision kernel</h2>
    <p className="muted">
      These three fixed, fictional cases are evaluated server-side. This does not create
      an invoice record, invoke AI, authenticate an issuer, or contact PayPal.
      The fixed policy thresholds are fictional inputs, not a read of live organization policy.
    </p>
    <div className="risk-evidence-list">
      {cases.map(item => <article className="risk-evidence-card" key={item.id}>
        <h3>{item.title}</h3>
        <p>Expected policy outcome: <strong>{item.expectedOutcome}</strong></p>
        <button type="button" disabled={busy !== null}
          onClick={() => void replay(item)}>
          {busy === item.id ? "Evaluating…" : "Evaluate fictional request"}
        </button>
        {results[item.id] ? <p role="status">
          Server decision: <strong>{results[item.id].outcome}</strong> /{" "}
          {results[item.id].reasonCodes.join(", ")}. No payout, database mutation or
          AI-derived authorization.
        </p> : null}
      </article>)}
    </div>
    {error ? <p role="alert" className="error">{error}</p> : null}
  </section>;
}
