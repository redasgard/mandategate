"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
  const [facts,setFacts]=useState<Facts>(()=>Object.fromEntries(
    fieldNames.map(name=>[name,{value:"",sourceFragment:"",pageNumber:1}]),
  ) as Facts);
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
  const prepare=()=>run("pages",async()=>{
    const result=await send("/pdf-pages");
    setPages(result.pages);
    setNotice("Parser-produced page texts are ready. Compare with the original PDF.");
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
    setNotice("T2 field-source proof recorded. Issuer origin is still unverified.");
  });
  const attest=()=>run("attest",async()=>{
    if(!selectedChannel || !outOfBandConfirmed)
      throw new Error("INDEPENDENT_VENDOR_CONTACT_NOT_CONFIRMED");
    const result=await send("/origin-attestations",{
      vendorId:selectedChannel.vendorId,
      channelId:selectedChannel.id,
      independentEvidenceReference:evidenceRef.trim(),
      expectedArtifactSha256:props.artifactSha256,
    });
    const a=result.attestation;
    setAttestationId(a.id);
    setAttestations(list=>[{
      id:a.id,vendorId:selectedChannel.vendorId,
      evidenceReference:evidenceRef.trim(),
      expiresAt:new Date(a.expiresAt).toISOString(),
    },...list]);
    setNotice("Human out-of-band attestation recorded. Software has not independently contacted the issuer.");
  });
  const propose=()=>run("proposal",async()=>{
    const result=await send("/proposals",{
      claimSetId:claimId,attestationId,
      expectedArtifactSha256:props.artifactSha256,
    });
    setProposal(result.proposal);
    setNotice("Proposal evaluated. No payment was authorized or sent.");
  });
  return <div className="review-wizard">
    <section className="review-stage">
      <p className="eyebrow">1 / Independent PDF text</p>
      <h2>Read the source before entering facts</h2>
      {pages.length===0?
        <button type="button" onClick={()=>void prepare()} disabled={busy!==null}>
          Parse original stored PDF (no AI inference)
        </button>:
        <div>{pages.map(p=><div className="review-page" key={p.pageNumber}>
          <div className="review-page-header">Page {p.pageNumber} / text SHA-256 {p.textSha256}</div>
          <pre>{p.text}</pre>
        </div>)}</div>}
      <p className="muted">Parsed text is document evidence, not issuer identity. Compare it with the original PDF; hidden layers and clipping may still cause differences. For a scanned PDF without extractable text, the agent analysis API can render a bounded single page for untrusted GLM observation, but that image result always escalates and never satisfies independent T2 evidence. Multi-page scans require manual review.</p>
    </section>
    <section className="review-stage">
      <p className="eyebrow">2 / T2 source corroboration</p>
      <h2>Record exact labeled payment-critical values</h2>
      <div className="review-grid">
        {fieldNames.map(name=><div key={name} className="review-field">
          <label>{labels[name]}
            <input value={facts[name].value}
              placeholder={name==="total_amount_decimal"?"1.01":""}
              onChange={e=>updateFact(name,"value",e.target.value)} />
          </label>
          <label>Exact quote from the selected page
            <textarea rows={2} value={facts[name].sourceFragment}
              onChange={e=>updateFact(name,"sourceFragment",e.target.value)}/>
          </label>
          <label>Page number
            <select value={facts[name].pageNumber}
              onChange={e=>updateFact(name,"pageNumber",Number(e.target.value))}>
              {pages.map(p=><option key={p.pageNumber} value={p.pageNumber}>{p.pageNumber}</option>)}
              {pages.length===0?<option value={1}>1</option>:null}
            </select>
          </label>
        </div>)}
      </div>
      <label>Review justification (minimum 16 characters)
        <textarea value={reason} rows={3}
          onChange={e=>setReason(e.target.value)} maxLength={500}/>
      </label>
      <button type="button" disabled={busy!==null || pages.length===0 || reason.trim().length<16}
        onClick={()=>void verify()}>Verify exact PDF field evidence</button>
      {claims.length>0?<label>Verified PDF claim to use for proposal
        <select value={claimId} onChange={e=>setClaimId(e.target.value)}>
          {claims.map(c=><option key={c.id} value={c.id}>
            {c.id} / {c.createdAt}
          </option>)}
        </select>
      </label>:null}
    </section>
    <section className="review-stage">
      <p className="eyebrow">3 / T3 independent issuer origin</p>
      <h2>Confirm through a previously enrolled vendor channel</h2>
      {props.eligibleChannels.length===0?
        <p className="error">No pre-existing eligible vendor channel is enrolled for this artifact. Do not attest using a contact printed on the invoice.</p>:
        <label>Trusted vendor channel (pre-enrolled)
          <select value={channelId} onChange={e=>setChannelId(e.target.value)}>
            {props.eligibleChannels.map(ch=><option key={ch.id} value={ch.id}>
              {ch.vendorName} / {ch.kind} / {ch.id}
            </option>)}
          </select>
        </label>}
      <label>Independent callback, portal or ERP evidence reference
        <input value={evidenceRef} onChange={e=>setEvidenceRef(e.target.value)}
          placeholder="callback-record:actual-reference-from-independent-system"/>
      </label>
      <label className="review-checkbox">
        <input type="checkbox" checked={outOfBandConfirmed}
          onChange={e=>setOutOfBandConfirmed(e.target.checked)}/>
        I personally checked the pre-established contact or system outside the invoice and recorded a genuine evidence reference.
      </label>
      <button type="button" disabled={busy!==null || !outOfBandConfirmed || !selectedChannel || evidenceRef.trim().length<16}
        onClick={()=>void attest()}>Record my out-of-band issuer attestation</button>
      {attestations.length>0?<label>Active origin attestation to use for proposal
        <select value={attestationId} onChange={e=>setAttestationId(e.target.value)}>
          {attestations.map(a=><option key={a.id} value={a.id}>
            {a.evidenceReference} / {a.id}
          </option>)}
        </select>
      </label>:null}
      <p className="muted">A format-valid evidence reference is not external authentication by itself. This records an accountable human assertion; a vendor callback/ERP record must really exist.</p>
    </section>
    <section className="review-stage">
      <p className="eyebrow">4 / Exact proposal</p>
      <h2>Freeze server-selected values before separate approval</h2>
      <p className="muted">This proposal resolves the trusted vendor, receiver, current policy and source records entirely on the server. No amount or receiver can be submitted here.</p>
      <button type="button" disabled={busy!==null || !claimId || !attestationId}
        onClick={()=>void propose()}>Evaluate and freeze payment proposal</button>
      {proposal?<div>
        <p>Decision: <strong>{proposal.outcome}</strong></p>
        <p className="mono">Reasons: {proposal.reasonCodes.join(", ")}</p>
        {proposal.historyEvidence?.length?<section role="alert">
          <h3>Imported paid-invoice history requires investigation</h3>
          <p>The following immutable import references are risk evidence, not payment authority.</p>
          <pre>{JSON.stringify(proposal.historyEvidence,null,2)}</pre>
        </section>:null}
        {proposal.bindingId?<div>
          <p>Frozen tuple SHA-256: <span className="mono">{proposal.tupleSha256}</span></p>
          <Link href={"/invoice-bindings/"+encodeURIComponent(proposal.bindingId)}>
            Open independent exact-tuple approval review
          </Link>
        </div>:<p>No approvable payment binding was created.</p>}
      </div>:null}
    </section>
    {notice?<p role="status" className="review-notice">{notice}</p>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </div>;
}
