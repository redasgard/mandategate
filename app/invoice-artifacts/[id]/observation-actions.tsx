"use client";

import Link from "next/link";
import { useState } from "react";
import { AdvisoryErrorDetails } from "@/app/components/advisory-error";

type SourceMime = "application/pdf" | "image/png" | "image/jpeg";
type Observation = {
  status: string;
  reasonCodes: string[];
  paymentAuthorized: false;
  observation: unknown;
  evidence: {
    model: string;
    provider: string;
    requestId: string;
    zdr: boolean;
    syntheticNonZdrTest?: boolean;
    sourceRasterization?: {
      sourceSha256: string;
      renderedPngSha256: string;
      rasterizerVersion: string;
      pageNumber: number;
      pageCount: number;
    } | null;
  };
};

export function InvoiceVisionObservation({
  artifactId, artifactSha256, mimeType,
  syntheticTestEnvironmentEnabled = false,
  syntheticTestAllowlisted = false,
}: {
  artifactId: string;
  artifactSha256: string;
  mimeType: SourceMime;
  syntheticTestEnvironmentEnabled?: boolean;
  syntheticTestAllowlisted?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Observation | null>(null);
  const [riskAccepted, setRiskAccepted] = useState(false);

  async function observe(synthetic: boolean) {
    if (busy || data || (synthetic && (!syntheticTestAllowlisted || !riskAccepted))) return;
    setBusy(true);
    setError(null);
    try {
      const endpoint = "/api/admin/invoice-artifacts/" + encodeURIComponent(artifactId) +
        (synthetic ? "/observe-synthetic" : "/observe");
      const res = await fetch(endpoint, {
        method: "POST",
        ...(synthetic ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedArtifactSha256: artifactSha256,
            syntheticFixtureOnly: true,
            acknowledgeProviderRetentionRisk: true,
          }),
        } : {}),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(typeof payload?.error === "string"
          ? payload.error : "INVOICE_OBSERVATION_FAILED");
      }
      setData(payload.observation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "INVOICE_OBSERVATION_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const strictControls = <section aria-label="Strict ZDR observation">
    <p className="eyebrow">Strict ZDR / real-data privacy requirements</p>
    <h3>Strict observation requires full account ZDR</h3>
    <p className="muted">
      This standard route will not submit invoice content unless account-level
      ZDR, no-training, prompt-capture and model-route checks pass. These
      protections are separate from the fictional demo exception. Model
      observations never authenticate the issuer or authorize payments.
    </p>
    <p><Link href="/invoice-artifacts/privacy">Check strict privacy metadata (no invoice sent)</Link></p>
    <button disabled={busy || Boolean(data)} onClick={() => void observe(false)}>
      {busy ? "Analyzing…" : "Observe this stored document (strict ZDR)"}
    </button>
  </section>;

  return <section className="review-stage">
    <p className="eyebrow">AI / advisory observation only</p>
    <h2>GLM-5.3 Flash invoice observations</h2>
    <p className="muted">
      The model can suggest invoice facts, but it cannot authenticate the source,
      update a trusted destination, approve a payment, or execute a payout.
      Single-page PDFs are rendered locally; multi-page scans require review.
    </p>
    <p>Source: <span className="mono">{mimeType} / {artifactSha256}</span></p>

    {syntheticTestEnvironmentEnabled ? <section className="synthetic-test-box" aria-label="Synthetic non-ZDR test">
      <p className="eyebrow">Demo only / non-ZDR test</p>
      <h3>Hackathon demo: observe an approved fictional invoice</h3>
      <p>
        This is an explicitly permitted test exception, not a production privacy pass.
        Experiential Labs may retain submitted content according to its account policies.
        Never upload a real invoice, customer data, credentials or financial details for this test.
      </p>
      <p className="muted">
        The original file SHA-256 must be on the server's synthetic-fixture allowlist.
        Paid provider privacy protections (ZDR, no-training enforcement, and
        prompt-capture restrictions) may be unavailable. The provider may retain,
        log, or use this fictional test document under its terms. Results always
        escalate and cannot authorize or execute a payment.
      </p>
      {!syntheticTestAllowlisted ? <p role="status" className="error">
        This document is not an approved synthetic fixture. Non-ZDR observation is unavailable.
      </p> : <label className="review-checkbox">
        <input type="checkbox" checked={riskAccepted} disabled={busy || Boolean(data)}
          onChange={event => setRiskAccepted(event.currentTarget.checked)}/>
        <span>I confirm this is an approved fictional test document, with no real
          customer or financial data. I accept that the provider may retain, log,
          or use its contents, including for training, under its terms.
          This request does not establish privacy compliance.</span>
      </label>}
      <button disabled={busy || Boolean(data) || !syntheticTestAllowlisted || !riskAccepted}
        onClick={() => void observe(true)}>
        {busy ? "Analyzing…" : "Run synthetic test without ZDR"}
      </button>
    </section> : null}

    {syntheticTestEnvironmentEnabled
      ? <details className="strict-privacy-details">
          <summary>Strict privacy route (requires full account ZDR)</summary>
          {strictControls}
        </details>
      : strictControls}

    {error ? <AdvisoryErrorDetails code={error}/> : null}
    {data ? <div role="status">
      <p>Disposition: <strong>{data.status}</strong>. Payment authorized: <strong>No</strong>.</p>
      <p className="mono">Reasons: {data.reasonCodes.join(", ")}</p>
      <p>Mode: <strong>{data.evidence.syntheticNonZdrTest
        ? "Synthetic non-ZDR test, advisory only"
        : "Strict privacy observation"}</strong></p>
      <p>Model: {data.evidence.model}; provider: {data.evidence.provider};
        ZDR serving route: {String(data.evidence.zdr)}</p>
      <p className="mono">Gateway request: {data.evidence.requestId}</p>
      {data.evidence.sourceRasterization ? <p className="mono">
        PDF image SHA-256: {data.evidence.sourceRasterization.renderedPngSha256}
        / page {data.evidence.sourceRasterization.pageNumber}
      </p> : null}
      <details><summary>Untrusted extracted fields</summary>
        <pre>{JSON.stringify(data.observation, null, 2)}</pre>
      </details>
      <p className="muted">These are untrusted T1 observations. Separate,
        independently source-verified T2 evidence is required before payment review.</p>
    </div> : null}
  </section>;
}
