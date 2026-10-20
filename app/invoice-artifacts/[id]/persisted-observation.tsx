import {invoiceExtractionSchema} from "@/src/invoices/schema";

const FIELDS=[
  {key:"vendor_name",label:"Supplier"},
  {key:"invoice_number",label:"Invoice number"},
  {key:"total_amount_decimal",label:"Amount"},
  {key:"currency",label:"Currency"},
  {key:"invoice_payment_destination",label:"Payment address"},
  {key:"invoice_date",label:"Invoice date"},
] as const;

const EXPLANATIONS:Record<string,string>={
  LOW_CONFIDENCE_VENDOR_NAME:"Supplier name needs a closer look.",
  IMAGE_EVIDENCE_NOT_VERIFIED:"Check the original PDF. AI quotations are not independent verification.",
  SCANNED_PDF_VISUAL_OBSERVATION_UNVERIFIED:"This PDF was rendered as an image for AI. Confirm its printed details.",
  DESTINATION_MISMATCH_UNTRUSTED:"Printed payment address may differ from the trusted vendor record.",
  DOCUMENT_INSTRUCTIONS_SUSPECTED:"The document may contain instructions aimed at the AI. They are not payment instructions.",
  EXTRACTION_INVALID:"The AI response could not be validated.",
  INVALID_AMOUNT:"AI could not extract a valid payment total.",
};

type RecordView={
  state?:unknown;error_code?:unknown;model?:unknown;provider_name?:unknown;
  gateway_request_id?:unknown;prompt_version?:unknown;prompt_sha256?:unknown;
  input_sha256?:unknown;rendered_input_sha256?:unknown;extraction?:unknown;
  reason_codes?:unknown;
};
const stringOr=(value:unknown,fallback="Not available")=>
  typeof value==="string"&&value.length>0?value.slice(0,240):fallback;
const shaOrNull=(value:unknown)=>
  typeof value==="string"&&/^[a-f0-9]{64}$/.test(value)?value:null;

export function PersistedInvoiceObservation({record}:{record:unknown}){
  if(!record||typeof record!=="object"||Array.isArray(record))return null;
  const data=record as RecordView;
  const codes=Array.isArray(data.reason_codes)
    ? data.reason_codes.filter((code):code is string=>
        typeof code==="string"&&/^[A-Z][A-Z0-9_]{0,119}$/.test(code) &&
        code!=="SYNTHETIC_NON_ZDR_TEST_ONLY").slice(0,24)
    : [];
  const parsed=invoiceExtractionSchema.safeParse(data.extraction);
  const state=stringOr(data.state,"UNKNOWN");
  const complete=(state==="ESCALATE"||state==="EXTRACTED_UNTRUSTED") &&
    (data.error_code===null||data.error_code===undefined||data.error_code==="") &&
    parsed.success;
  const messages=codes.filter(code=>Boolean(EXPLANATIONS[code])).map(code=>EXPLANATIONS[code]);
  const hasError=typeof data.error_code==="string" && data.error_code.trim().length>0;

  return <section className="invoice-ai-panel" aria-label="Persisted invoice AI observation">
    {complete && parsed.success ? <>
      <div className="invoice-section-heading">
        <div>
          <p className="eyebrow">AI analysis complete</p>
          <h2>Here's what GLM found</h2>
          <p className="muted">These are AI suggestions, not verified payment details.
            Compare them with the original invoice before approval.</p>
        </div>
        <span className="invoice-status needs-review">Review needed</span>
      </div>
      <div className="invoice-extract-grid">
        {FIELDS.map(item=>{
          const fact=parsed.data[item.key];
          return <div className="invoice-extract-item" key={item.key}>
            <span>{item.label}</span>
            <strong>{fact.value??"Not found"}</strong>
            {fact.value && fact.confidence<0.65
              ? <small className="invoice-attention">Low model confidence. Please check.</small>
              : null}
          </div>;
        })}
      </div>
      {messages.length ? <div className="invoice-review-notes" role="note">
        <strong>What needs attention</strong>
        <ul>{[...new Set(messages)].map(message=><li key={message}>{message}</li>)}</ul>
      </div> : null}
    </> : <>
      <div className="invoice-section-heading">
        <div>
          <p className="eyebrow">AI analysis</p>
          <h2>{state==="FAILED"?"Earlier analysis attempt failed":"No completed analysis yet"}</h2>
        </div>
        <span className="invoice-status needs-review">{state==="FAILED"?"Retry available":"Not analyzed"}</span>
      </div>
      <p className="muted" role="status">
        No schema-accepted field observations are available for this saved outcome.
        Do not treat this as successful extraction.
        {state==="FAILED"?" Use the Analyze invoice with AI action to retry the stored document.":""}
      </p>
    </>}
    <details className="invoice-technical">
      <summary>AI evidence and technical details</summary>
      <p>Recorded state: <strong>{state}</strong>.
        {hasError?<> Failure: <code>{stringOr(data.error_code)}</code>.</>:null}
      </p>
      {codes.length?<div className="chips">{codes.map(code=><span key={code}>{code}</span>)}</div>:null}
      {complete && parsed.success ? <div className="invoice-evidence-grid">
        {FIELDS.map(item=>{
          const fact=parsed.data[item.key];
          return <article key={item.key} className="invoice-evidence-item">
            <h3>{item.label}</h3>
            <p>{fact.value??"Not observed"}</p>
            <p className="muted">Model confidence: {Math.round(fact.confidence*100)}%.
              {fact.evidence.length===0?" No source quotation was supplied.":" Quote evidence is unverified."}
            </p>
            {fact.evidence.length?<details>
              <summary>Model-proposed source quotations ({fact.evidence.length})</summary>
              {fact.evidence.map((source,index)=><p className="muted" key={index}>
                Page {source.page_number}: <q>{source.source_fragment}</q>
              </p>)}
            </details>:null}
          </article>;
        })}
      </div>:null}
      <details>
        <summary>Provider and source provenance</summary>
        <p className="muted">The independent PDF source review establishes document
          evidence. AI quotes alone do not establish issuer identity.</p>
        <dl>
          <div><dt>Requested model</dt><dd>{stringOr(data.model)}</dd></div>
          <div><dt>Serving provider</dt><dd>{stringOr(data.provider_name)}</dd></div>
          <div><dt>Gateway request</dt><dd>{stringOr(data.gateway_request_id)}</dd></div>
          <div><dt>Prompt version</dt><dd>{stringOr(data.prompt_version)}</dd></div>
          {shaOrNull(data.prompt_sha256)?<div><dt>Prompt SHA-256</dt><dd className="mono">{data.prompt_sha256 as string}</dd></div>:null}
          {shaOrNull(data.input_sha256)?<div><dt>Model input SHA-256</dt><dd className="mono">{data.input_sha256 as string}</dd></div>:null}
          {shaOrNull(data.rendered_input_sha256)?<div><dt>Rendered PDF PNG SHA-256</dt><dd className="mono">{data.rendered_input_sha256 as string}</dd></div>:null}
        </dl>
      </details>
    </details>
  </section>;
}
