import { presentDecisionEvidence } from "@/src/history/decision-evidence-presentation";

const sourceLabel=(source:string)=>{
  const known:Record<string,string>={
    "vendor.trusted_destination":"Vendor trusted destination",
    "vendor.normal_max_amount_cents":"Vendor normal amount limit",
    "policy.auto_pay_max_amount_cents":"Policy auto-pay limit",
    "deterministic_policy":"Deterministic policy",
  };
  if(known[source])return known[source];
  if(source.startsWith("ap_history."))return "Imported AP history";
  return source;
};

export function DecisionEvidencePanel({
  evidence, reasonCodes, currency,
}: {
  evidence: unknown;
  reasonCodes: readonly string[];
  currency: string;
}) {
  const items = presentDecisionEvidence(evidence, currency);
  return <section className="review-stage" aria-label="Decision evidence">
    <p className="eyebrow">Explainable payment controls</p>
    <h2>Why MandateGate made this decision</h2>
    <p className="muted">These are recorded deterministic checks and observations, not AI-generated payment approvals.
      Imported AP history can trigger investigation but cannot establish vendor identity or trusted destinations.</p>
    <div className="chips" aria-label="Recorded reason codes">
      {reasonCodes.map(code => <span key={code}>{code}</span>)}
    </div>
    {items.length ? <div className="risk-evidence-list">
      {items.map((item, i) => <article className="risk-evidence-card" key={item.code + ":" + i}>
        <p className="eyebrow">{item.code}</p>
        <h3>{item.title}</h3>
        <p>{item.explanation}</p>
        {item.source ? <p className="muted"><strong>Detection source:</strong> {sourceLabel(item.source)}</p> : null}
        {item.observed !== null || item.expected !== null ? <dl>
          {item.observed !== null ? <div><dt>Observed</dt><dd>{item.observed}</dd></div> : null}
          {item.expected !== null ? <div><dt>Compared with</dt><dd>{item.expected}</dd></div> : null}
        </dl> : null}
        {item.importId || item.sourceSha256 || item.rowSha256 ? <details>
          <summary>Historical evidence provenance</summary>
          <dl className="risk-provenance">
            {item.importId ? <div><dt>Import record</dt><dd><code>{item.importId}</code></dd></div> : null}
            {item.sourceSha256 ? <div><dt>Source file SHA-256</dt><dd><code>{item.sourceSha256}</code></dd></div> : null}
            {item.rowSha256 ? <div><dt>Paid-row SHA-256</dt><dd><code>{item.rowSha256}</code></dd></div> : null}
            {item.sampleCount !== null ? <div><dt>Comparison sample size</dt><dd>{item.sampleCount}</dd></div> : null}
          </dl>
        </details> : null}
      </article>)}
    </div> : <p className="muted">No structured evidence is available for this decision. The reason codes above remain the recorded classification.</p>}
    <details>
      <summary>Machine-readable decision evidence</summary>
      <pre>{JSON.stringify(evidence, null, 2)}</pre>
    </details>
  </section>;
}
