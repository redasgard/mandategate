import Link from "next/link";
import type { DemoEvidence } from "@/src/demo/evidence";

const meaning: Record<string,string> = {
  DOCUMENT_INSTRUCTIONS_SUSPECTED: "Document instructions were treated as hostile content",
  INVALID_AMOUNT: "The amount was not a valid payable number",
  IMAGE_EVIDENCE_NOT_VERIFIED: "Model-proposed source quotes are not independently corroborated",
  SCANNED_PDF_VISUAL_OBSERVATION_UNVERIFIED: "The scanned image has no independently verified PDF text",
  SYNTHETIC_NON_ZDR_TEST_ONLY: "Fictional-only provider retention exception, not ZDR compliance",
};

export function DemoVisionEvidence({ evidence }: { evidence: DemoEvidence }) {
  return <section id="demo-ai-observations" className="review-stage" aria-label="Saved fictional GLM observation evidence">
    <p className="eyebrow">AI evidence / observed, not authorized</p>
    <h2>What GLM observed in fictional invoices</h2>
    <p className="muted">
      These T1 model observations were saved from consented fictional-only tests.
      The model proposed invoice facts but could not independently authenticate a PDF,
      verify a vendor, update a receiver, or authorize PayPal.
      Every observation shown here remained ESCALATE.
    </p>
    {evidence.findings.length === 0
      ? <p>No consented synthetic observations are available in this organization.
        <Link href="/invoice-artifacts"> Review stored source invoices →</Link></p>
      : <div className="risk-evidence-list">
        {evidence.findings.map((finding, index) =>
          <article className="risk-evidence-card" key={finding.artifactId}>
            <p className="eyebrow">Saved GLM observation {index + 1} / ESCALATE</p>
            <h3>{finding.fieldsSchemaValid
              ? finding.invoiceNumber ?? "Invoice number not observed"
              : "Untrusted extraction rejected by schema"}</h3>
            <p><strong>Model-proposed vendor:</strong>{" "}
              {finding.fieldsSchemaValid
                ? finding.vendor ?? "Not observed"
                : "Not schema-accepted"}</p>
            <p><strong>Model-proposed total:</strong>{" "}
              {finding.fieldsSchemaValid && finding.amount &&
                /^[0-9]{1,16}(?:\.[0-9]{1,2})?$/.test(finding.amount) &&
                !finding.reasonCodes.includes("INVALID_AMOUNT")
                ? (finding.currency ?? "Currency unverified") + " " + finding.amount
                : "Invalid or not schema-accepted as payable"}</p>
            <p><strong>Finding:</strong> Advisory-only. Payment authority: <strong>No.</strong></p>
            {finding.reasonCodes.filter(code => code in meaning).map(code =>
              <p className="muted" key={code}>
                <strong>{code}:</strong> {meaning[code]}
              </p>)}
            <details>
              <summary>Source and gateway provenance</summary>
              <p className="muted">Model: {finding.model}; provider reported: {finding.provider ?? "Unknown"}</p>
              <p className="muted">Gateway request: {finding.requestId ?? "Not recorded"}</p>
              <p className="muted">Original SHA-256 prefix: <code>{finding.sourceShaPrefix}</code></p>
              <p className="muted">These metadata fields are not independent proof of provider privacy or vendor identity.</p>
            </details>
            <p><Link href={"/invoice-artifacts/" + encodeURIComponent(finding.artifactId)}>
              Inspect the original document and stored model evidence →
            </Link></p>
          </article>)}
      </div>}
    <section id="demo-payment-boundary" className="risk-evidence-card" aria-label="Separate PayPal execution evidence">
      <p className="eyebrow">PayPal execution / tenant-scoped local record check</p>
      <h3>All local payment execution rows in this demo organization: {evidence.organizationExecutionRows}</h3>
      <p className="muted">
        This read-only count covers every local execution record in the demo
        organization, including trusted-agent and invoice-derived requests.
        It is not a fresh PayPal query or proof of completed remote settlement.
        The deterministic demo requests do not originate from the GLM PDFs.
        The earlier historical Sandbox receipt belongs to another environment.
      </p>
      {evidence.organizationExecutionRows > 0
        ? <p role="alert">Execution records exist in this demo organization.
            Stop judge replay and independently reconcile each payment and webhook.</p>
        : <p>No local payment execution records are present in this demo
            organization. This does not independently prove remote PayPal
            settlement state; no payment is authorized by this AI panel.</p>}
    </section>
  </section>;
}
