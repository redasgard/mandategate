"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  suggestUnverifiedPdfReviewFacts, mergeSuggestionsWithoutOverwritingReview,
} from "@/src/invoices/pdf-review-suggestions";

const fieldNames=[
  "vendor_name","invoice_number","currency",
  "total_amount_decimal","invoice_payment_destination",
] as const;
type FieldName=(typeof fieldNames)[number];
type Fact={value:string;sourceFragment:string;pageNumber:number};
type Facts=Record<FieldName,Fact>;
type SourcePage={pageNumber:number;text:string;textSha256:string};
type Channel={id:string;vendorId:string;vendorName:string;kind:string};
type Claim={id:string;createdAt:string};
type Attestation={id:string;vendorId:string;evidenceReference:string;expiresAt:string};

const labels:Record<FieldName,string>={
  vendor_name:"Printed vendor name",
  invoice_number:"Invoice number",
  currency:"Currency (ISO 4217)",
  total_amount_decimal:"Final total amount",
  invoice_payment_destination:"Printed payment destination",
};

export function InvoiceArtifactReview(props:{
  artifactId:string;artifactSha256:string;initialPages:SourcePage[];
  eligibleChannels:Channel[];initialClaims:Claim[];initialAttestations:Attestation[];
}) {
  const [pages,setPages]=useState<SourcePage[]>(props.initialPages);
  const [facts,setFacts]=useState<Facts>(()=>{
    const blanks=Object.fromEntries(
      fieldNames.map(name=>[name,{value:"",sourceFragment:"",pageNumber:1}]),
    ) as Facts;
    // Saved, parser-derived text can supply advisory fields on first render.
    // They remain editable and cannot skip explicit source review or T3/T4.
    return props.initialPages.length
      ? mergeSuggestionsWithoutOverwritingReview(
          blanks,suggestUnverifiedPdfReviewFacts(props.initialPages),
        )
      : blanks;
  });
  const [activeStep,setActiveStep]=useState<1|2|3>(
    props.initialAttestations.length>0?3:props.initialClaims.length>0?2:1,
  );
  const [reason,setReason]=useState("");
  const [claims,setClaims]=useState<Claim[]>(props.initialClaims);
  const [attestations,setAttestations]=useState<Attestation[]>(props.initialAttestations);
  const [claimId,setClaimId]=useState(props.initialClaims[0]?.id??"");
  const [attestationId,setAttestationId]=useState(props.initialAttestations[0]?.id??"");
  const [channelId,setChannelId]=useState(props.eligibleChannels[0]?.id??"");
  const [evidenceRef,setEvidenceRef]=useState("");
  const [outOfBandConfirmed,setOutOfBandConfirmed]=useState(false);
  const [proposal,setProposal]=useState<{
    outcome:string;reasonCodes:string[];bindingId:string|null;tupleSha256:string|null;
    historyEvidence?:Array<{code:string;source:string;observed:string|number;expected?:string|number;
      provenance?:{importId:string;rowSha256:string;sourceSha256:string}}>; 
  }|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const selectedChannel=useMemo(
    ()=>props.eligibleChannels.find(c=>c.id===channelId),
    [channelId,props.eligibleChannels],
  );
  const fictionalChannel=selectedChannel?.kind==="SYNTHETIC_FIXTURE";
  const prefix= "/api/admin/invoice-artifacts/"+encodeURIComponent(props.artifactId);
  const updateFact=(name:FieldName,key:keyof Fact,value:string|number)=>
    setFacts(prev=>({...prev,[name]:{...prev[name],[key]:value}}));

  async function send(path:string,body?:unknown) {
    const res=await fetch(prefix+path,{
      method:"POST",
      headers:body===undefined?{}:{"Content-Type":"application/json"},
      body:body===undefined?undefined:JSON.stringify(body),
    });
    const json=await res.json();
    if(!res.ok)throw new Error(
      typeof json?.error==="string"?json.error:"REVIEW_REQUEST_FAILED",
    );
    return json;
  }
  async function run(name:string,task:()=>Promise<void>) {
    if(busy)return;
    setBusy(name);setError(null);setNotice(null);
    try {await task();}
    catch(e){setError(e instanceof Error?e.message:"REVIEW_REQUEST_FAILED");}
    finally{setBusy(null);}
  }
  const suggest=(sourcePages:SourcePage[])=>{
    const suggestions=suggestUnverifiedPdfReviewFacts(sourcePages);
    setFacts(prev=>mergeSuggestionsWithoutOverwritingReview(prev,suggestions));
    setNotice(`Suggested ${fieldNames.length-suggestions.missing.length} unverified field(s) from parser-produced text. Compare every fact with the original PDF; nothing has been approved or sent to PayPal.`);
  };
  const prepare=()=>run("pages",async()=>{
    const result=await send("/pdf-pages");
    setPages(result.pages);
    suggest(result.pages);
  });
  const verify=()=>run("verify",async()=>{
    const result=await send("/verify-pdf-facts",{
      artifactId:props.artifactId,
      expectedArtifactSha256:props.artifactSha256,
      reviewerReason:reason,
      facts,
    });
    const id=result.review.claimSetId as string;
    setClaimId(id);setClaims(list=>[{
      id,createdAt:new Date().toISOString(),
    },...list]);
    setNotice("Invoice details verified against the original PDF. Next: confirm the supplier.");
    setActiveStep(2);
  });
  const attest=()=>run("attest",async()=>{
    if(!selectedChannel || !outOfBandConfirmed)
      throw new Error(fictionalChannel?"SANDBOX_FICTIONAL_SOURCE_ACK_REQUIRED":"INDEPENDENT_VENDOR_CONTACT_NOT_CONFIRMED");
    const result=await send("/origin-attestations",{
      vendorId:selectedChannel.vendorId,
      channelId:selectedChannel.id,
      independentEvidenceReference:evidenceRef.trim(),
      expectedArtifactSha256:props.artifactSha256,
      confirmedSyntheticSimulation:fictionalChannel,
    });
    const a=result.attestation;
    setAttestationId(a.id);
    setAttestations(list=>[{
      id:a.id,vendorId:selectedChannel.vendorId,
      evidenceReference:evidenceRef.trim(),
      expiresAt:new Date(a.expiresAt).toISOString(),
    },...list]);
    setNotice(fictionalChannel?"Northstar test supplier confirmed for PayPal Sandbox. No payment was authorized.":"Supplier source confirmation saved. Payment is not yet approved.");
    setActiveStep(3);
  });
  const propose=()=>run("proposal",async()=>{
    const result=await send("/proposals",{
      claimSetId:claimId,attestationId,
      expectedArtifactSha256:props.artifactSha256,
    });
    setProposal(result.proposal);
    setNotice("Proposal evaluated. No payment was authorized or sent.");
  });
  return <div className="invoice-review-wizard" id="invoice-review-workflow">
    <header className="invoice-section-heading">
      <div>
        <p className="eyebrow">Invoice review</p>
        <h2>Three short checks before payment</h2>
        <p className="muted">Your review creates an auditable payment request.
          Actual PayPal execution remains a separate confirmation.</p>
      </div>
    </header>
    <nav className="invoice-task-steps" aria-label="Invoice verification steps">
      <button type="button" className={activeStep===1?"current":claims.length?"complete":""}
        aria-current={activeStep===1?"step":undefined} onClick={()=>setActiveStep(1)}>
        <span>{claims.length?"✓":"1"}</span> Invoice details
      </button>
      <button type="button" className={activeStep===2?"current":attestations.length?"complete":""}
        aria-current={activeStep===2?"step":undefined} disabled={!claimId}
        onClick={()=>setActiveStep(2)}>
        <span>{attestations.length?"✓":"2"}</span> Supplier
      </button>
      <button type="button" className={activeStep===3?"current":""}
        aria-current={activeStep===3?"step":undefined} disabled={!claimId||!attestationId}
        onClick={()=>setActiveStep(3)}>
        <span>3</span> Payment checks
      </button>
    </nav>

    {activeStep===1 ? <section className="invoice-task-card" aria-label="Verify invoice details">
      <div className="invoice-task-card-head">
        <span className="invoice-step-number">01</span>
        <div><h3>Confirm the invoice details</h3>
          <p className="muted">Check these five fields against the original PDF.
            We've suggested what we can; you make the final decision.</p>
        </div>
      </div>
      <a className="invoice-secondary-link" target="_blank" rel="noopener noreferrer"
        href={"/api/admin/invoice-artifacts/"+encodeURIComponent(props.artifactId)+"/source"}>
        Open original invoice ↗
      </a>
      {pages.length===0 ?
        <div className="invoice-task-prompt">
          <p>Extract the readable text from this PDF to fill the review form.</p>
          <button type="button" onClick={()=>void prepare()} disabled={busy!==null}>
            {busy==="pages"?"Reading invoice…":"Read invoice details"}
          </button>
        </div>
        : <>
          <div className="invoice-fields">
            {fieldNames.map(name=><div className="invoice-field-row" key={name}>
              <label className="invoice-value-field">{labels[name]}
                <input value={facts[name].value}
                  placeholder={name==="total_amount_decimal"?"0.00":"Not found"}
                  onChange={e=>updateFact(name,"value",e.target.value)} />
              </label>
              <details className="invoice-field-evidence"
                open={!facts[name].sourceFragment.trim()}>
                <summary>Source quote {facts[name].sourceFragment.trim()?"✓":"needed"}</summary>
                <label>Exact phrase from original PDF
                  <textarea rows={2} value={facts[name].sourceFragment}
                    onChange={e=>updateFact(name,"sourceFragment",e.target.value)}/>
                </label>
                <label>Page
                  <select value={facts[name].pageNumber}
                    onChange={e=>updateFact(name,"pageNumber",Number(e.target.value))}>
                    {pages.map(p=><option key={p.pageNumber} value={p.pageNumber}>{p.pageNumber}</option>)}
                  </select>
                </label>
              </details>
            </div>)}
          </div>
          <details className="invoice-technical">
            <summary>Show PDF source text and hashes</summary>
            {pages.map(p=><div className="review-page" key={p.pageNumber}>
              <div className="review-page-header">Page {p.pageNumber} · text SHA-256 {p.textSha256}</div>
              <pre>{p.text}</pre>
            </div>)}
            <button type="button" className="invoice-ghost-button"
              onClick={()=>suggest(pages)} disabled={busy!==null}>
              Refresh missing suggestions
            </button>
          </details>
          <label className="invoice-review-reason">Reason for verifying these details
            <textarea value={reason} rows={2} maxLength={500}
              placeholder="I checked the printed invoice, amount and payment address against the original PDF."
              onChange={e=>setReason(e.target.value)}/>
          </label>
          <button type="button" className="invoice-primary-action"
            disabled={busy!==null||reason.trim().length<16}
            onClick={()=>void verify()}>
            {busy==="verify"?"Verifying…":"Verify invoice details & continue →"}
          </button>
          <p className="invoice-small-note">No payment is sent at this step.
            Source quotations remain available under each field.</p>
        </>}
    </section> : null}

    {activeStep===2 ? <section className="invoice-task-card" aria-label="Confirm invoice supplier">
      <div className="invoice-task-card-head">
        <span className="invoice-step-number">02</span>
        <div><h3>Confirm the supplier</h3>
          <p className="muted">Match this invoice to a supplier source registered
            before the invoice was uploaded.</p>
        </div>
      </div>
      {props.eligibleChannels.length===0 ? <div className="invoice-review-notes">
        <p>No eligible supplier source is registered for this invoice.</p>
        <Link href="/vendor-origin-channels">Register supplier source →</Link>
      </div> : <label>Supplier source
        <select value={channelId} onChange={e=>{
          setChannelId(e.target.value);setOutOfBandConfirmed(false);setEvidenceRef("");
        }}>
          {props.eligibleChannels.map(ch=><option value={ch.id} key={ch.id}>
            {ch.vendorName} {ch.kind==="SYNTHETIC_FIXTURE"?"(PayPal Sandbox test supplier)":""}
          </option>)}
        </select>
      </label>}
      <label>{fictionalChannel?"Test supplier reference":"Independent supplier verification reference"}
        <input value={evidenceRef} onChange={e=>setEvidenceRef(e.target.value)}
          placeholder={fictionalChannel?"synthetic-fixture:northstar-sandbox-001":"callback-record:verified-reference"} />
      </label>
      <label className="review-checkbox invoice-confirm-check">
        <input type="checkbox" checked={outOfBandConfirmed}
          onChange={e=>setOutOfBandConfirmed(e.target.checked)}/>
        <span>{fictionalChannel
          ?"This is a PayPal Sandbox test supplier. No live supplier was contacted or authenticated."
          :"I independently checked this supplier through the registered source, not from the invoice alone."}</span>
      </label>
      <button type="button" className="invoice-primary-action"
        disabled={busy!==null||!outOfBandConfirmed||!selectedChannel||evidenceRef.trim().length<16}
        onClick={()=>void attest()}>
        {busy==="attest"?"Recording confirmation…":"Confirm supplier & continue →"}
      </button>
      <p className="invoice-small-note">Supplier confirmation cannot authorize
        or execute a PayPal payout.</p>
    </section> : null}

    {activeStep===3 ? <section className="invoice-task-card" aria-label="Review payment policy">
      <div className="invoice-task-card-head">
        <span className="invoice-step-number">03</span>
        <div><h3>Check the payment</h3>
          <p className="muted">MandateGate compares the reviewed invoice with
            the trusted vendor destination, duplicates and payment limits.</p>
        </div>
      </div>
      <div className="invoice-payment-preview">
        <div><span>Supplier</span><strong>{facts.vendor_name.value||"Not supplied"}</strong></div>
        <div><span>Invoice</span><strong>{facts.invoice_number.value||"Not supplied"}</strong></div>
        <div><span>Amount on document</span>
          <strong>{facts.currency.value} {facts.total_amount_decimal.value}</strong></div>
        <div><span>Payment address on document</span>
          <strong>{facts.invoice_payment_destination.value||"Not supplied"}</strong></div>
      </div>
      <p className="invoice-small-note">These are the reviewed document fields.
        Final payment values are independently selected by the server.</p>
      <button type="button" className="invoice-primary-action" disabled={busy!==null||!claimId||!attestationId}
        onClick={()=>void propose()}>
        {busy==="proposal"?"Checking policy…":"Run payment checks →"}
      </button>
      {proposal?<div className="invoice-policy-result" role="status">
        <strong>{proposal.bindingId?"Payment ready for your approval":
          proposal.outcome==="DENY"?"Payment blocked":"Payment needs attention"}</strong>
        <p>{proposal.bindingId
          ?"MandateGate froze the exact payment details. A separate approval is required."
          :"Review the policy findings before trying to authorize this invoice."}</p>
        {proposal.bindingId ? <Link className="invoice-primary-link"
          href={"/invoice-bindings/"+encodeURIComponent(proposal.bindingId)}>
          Continue to payment approval →
        </Link>:null}
        <details className="invoice-technical">
          <summary>Technical policy findings</summary>
          <pre>{JSON.stringify({
            outcome:proposal.outcome,reasonCodes:proposal.reasonCodes,
            historyEvidence:proposal.historyEvidence,
            tupleSha256:proposal.tupleSha256,
          },null,2)}</pre>
        </details>
      </div>:null}
    </section> : null}
    {notice?<p className="review-notice" role="status">{notice}</p>:null}
    {error?<p className="error" role="alert">{error}</p>:null}
  </div>;
}
