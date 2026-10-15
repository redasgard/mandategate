import { invoiceExtractionSchema } from "@/src/invoices/schema";

const DISPLAY_FIELDS = [
  { key: "vendor_name", label: "Vendor" },
  { key: "invoice_number", label: "Invoice number" },
  { key: "invoice_date", label: "Invoice date" },
  { key: "currency", label: "Currency" },
  { key: "total_amount_decimal", label: "Amount due" },
  { key: "invoice_payment_destination", label: "Destination printed on invoice" },
] as const;

const EXPLANATIONS: Record<string, string> = {
  SYNTHETIC_NON_ZDR_TEST_ONLY: "Fictional test using a non-ZDR provider route. Real invoice privacy was not established.",
  SCANNED_PDF_VISUAL_OBSERVATION_UNVERIFIED: "Rasterized PDF observations need separate document-source verification.",
  IMAGE_EVIDENCE_NOT_VERIFIED: "Model-proposed quotes are not independently verified against the source.",
  EXTRACTION_INVALID: "The returned fields did not satisfy the strict invoice schema.",
  INVALID_AMOUNT: "The model did not produce an acceptable decimal payable amount.",
  DOCUMENT_INSTRUCTIONS_SUSPECTED: "The source may contain instructions aimed at the model. They have no authority.",
  DESTINATION_MISMATCH_UNTRUSTED: "The printed destination differs from a trusted destination. Never update vendor trust from an invoice.",
};

type RecordView = {
  state?: unknown;
  error_code?: unknown;
  model?: unknown;
  provider_name?: unknown;
  gateway_request_id?: unknown;
  gateway_zdr?: unknown;
  prompt_version?: unknown;
  prompt_sha256?: unknown;
  input_sha256?: unknown;
  rendered_input_sha256?: unknown;
  extraction?: unknown;
  reason_codes?: unknown;
};

const stringOr = (value: unknown, fallback = "Not available") =>
  typeof value === "string" && value.length > 0 ? value.slice(0, 240) : fallback;
const shaOrNull = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null;

export function PersistedInvoiceObservation({ record }: { record: unknown }) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const data = record as RecordView;
  const codes = Array.isArray(data.reason_codes)
    ? data.reason_codes.filter((s): s is string => typeof s === "string" &&
      /^[A-Z][A-Z0-9_]{0,119}$/.test(s)).slice(0, 24)
    : [];
  const parsed = invoiceExtractionSchema.safeParse(data.extraction);
  // Valid-shaped fields alone do not establish a completed observation.
  const hasCompletedObservation = data.state === "ESCALATE" || data.state === "EXTRACTED_UNTRUSTED";
  const hasNoRecordedError = data.error_code === null || data.error_code === undefined || data.error_code === "";
  const state = stringOr(data.state, "UNKNOWN");
  const synthetic = codes.includes("SYNTHETIC_NON_ZDR_TEST_ONLY");
  const promptHash = shaOrNull(data.prompt_sha256);
  const inputHash = shaOrNull(data.input_sha256);
  const imageHash = shaOrNull(data.rendered_input_sha256);

  return <section className="review-stage" aria-label="Persisted invoice AI observation">
    <p className="eyebrow">Saved AI investigation / advisory only</p>
    <h2>What GLM observed in this invoice</h2>
    <p className="muted">Read-only observation from Neon. The model cannot verify the issuer,
      approve payment, or change a trusted receiver. Complete the independent PDF source
      verification and vendor-origin checks below before preparing any payment review.</p>
    <p>Recorded state: <strong>{state}</strong>.
      {typeof data.error_code === "string" && data.error_code.length > 0
        ? <> Failure: <code>{stringOr(data.error_code)}</code>.</> : null}
    </p>
    {synthetic ? <p className="muted" role="note">
      Synthetic non-ZDR test only. Provider retention may apply.
      This result is not a production privacy or issuer-authentication proof.
    </p> : null}
    {codes.length ? <div aria-label="Stored advisory risk reasons">
      <div className="chips">{codes.map(code => <span key={code}>{code}</span>)}</div>
      {codes.filter(code => EXPLANATIONS[code]).map(code =>
        <p className="muted" key={code}><strong>{code}:</strong> {EXPLANATIONS[code]}</p>)}
    </div> : null}
    {parsed.success && hasCompletedObservation && hasNoRecordedError ? <div className="risk-evidence-list">
      {DISPLAY_FIELDS.map(field => {
        const fact = parsed.data[field.key];
        return <article className="risk-evidence-card" key={field.key}>
          <p className="eyebrow">{field.label}</p>
          <p><strong>{fact.value ?? "Not observed"}</strong></p>
          <p className="muted">Model confidence: {Math.round(fact.confidence * 100)}%.
            {fact.evidence.length === 0 ? " No source quotation was supplied." : " Quote evidence is unverified."}
          </p>
          {fact.evidence.length ? <details>
            <summary>Model-proposed source quotations ({fact.evidence.length})</summary>
            {fact.evidence.map((ref, i) =>
              <p key={i} className="muted">
                Page {ref.page_number}: <q>{ref.source_fragment}</q>
              </p>)}
          </details> : null}
        </article>;
      })}
    </div> : <p className="muted" role="status">
      No schema-accepted field observations are available for this saved outcome. Do not treat this as successful extraction.
    </p>}
    <details>
      <summary>Provider and source provenance</summary>
      <dl>
        <div><dt>Requested model</dt><dd>{stringOr(data.model)}</dd></div>
        <div><dt>Serving provider</dt><dd>{stringOr(data.provider_name)}</dd></div>
        <div><dt>Gateway request</dt><dd className="mono">{stringOr(data.gateway_request_id)}</dd></div>
        <div><dt>Prompt version</dt><dd>{stringOr(data.prompt_version)}</dd></div>
        {promptHash ? <div><dt>Prompt SHA-256</dt><dd className="mono">{promptHash}</dd></div> : null}
        {inputHash ? <div><dt>Model input SHA-256</dt><dd className="mono">{inputHash}</dd></div> : null}
        {imageHash ? <div><dt>Rendered PDF PNG SHA-256</dt><dd className="mono">{imageHash}</dd></div> : null}
        <div><dt>Gateway ZDR metadata</dt><dd>{synthetic
          ? "Synthetic exception: ZDR metadata is not compliance proof"
          : data.gateway_zdr === true
            ? "Provider reported true; account-level policy verification is separate"
            : data.gateway_zdr === false ? "Provider reported false" : "Unverified"}</dd></div>
      </dl>
    </details>
  </section>;
}
