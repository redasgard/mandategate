"use client";

import Link from "next/link";
import { useState } from "react";

type SourceMime="application/pdf"|"image/png"|"image/jpeg";

export function InvoiceVisionObservation({artifactId,artifactSha256,mimeType}:{
  artifactId:string;artifactSha256:string;mimeType:SourceMime;
}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [data,setData]=useState<{
    status:string;reasonCodes:string[];paymentAuthorized:false;
    observation:unknown;
    evidence:{model:string;provider:string;requestId:string;zdr:boolean;
      sourceRasterization?:{sourceSha256:string;renderedPngSha256:string;
        rasterizerVersion:string;pageNumber:number;pageCount:number}|null};
  }|null>(null);
  async function observe(){
    if(busy)return;
    setBusy(true);setError(null);
    try{
      const res=await fetch("/api/admin/invoice-artifacts/"+encodeURIComponent(artifactId)+"/observe",{
        method:"POST",
      });
      const payload=await res.json();
      if(!res.ok)throw new Error(
        typeof payload?.error==="string"?payload.error:"INVOICE_OBSERVATION_FAILED",
      );
      setData(payload.observation);
    }catch(e){
      setError(e instanceof Error?e.message:"INVOICE_OBSERVATION_FAILED");
    }finally{setBusy(false);}
  }
  return <section className="review-stage">
    <p className="eyebrow">AI / advisory observation only</p>
    <h2>Run GLM-5.3 Flash with strict privacy checks</h2>
    <p className="muted">
      Sends a stored image to Experiential only after ZDR, no-training and
      prompt-capture checks pass. A single-page PDF is rendered locally first.
      Multi-page PDF images are held for manual review. Model observations
      never establish invoice authenticity, issuer identity or payment authority.
    </p>
    <p>Source: <span className="mono">{mimeType} / {artifactSha256}</span></p>
    <p><Link href="/invoice-artifacts/privacy">Check live account privacy metadata (no invoice sent)</Link></p>
    <button disabled={busy || Boolean(data)} onClick={()=>void observe()}>
      {busy?"Analyzing under fail-closed privacy policy…":"Observe this stored document (advisory only)"}
    </button>
    {error?<p role="alert" className="error">{error}</p>:null}
    {data?<div role="status">
      <p>Disposition: <strong>{data.status}</strong>. Payment authorized: <strong>No</strong>.</p>
      <p className="mono">Reasons: {data.reasonCodes.join(", ")}</p>
      <p>Model: {data.evidence.model}; provider: {data.evidence.provider};
        ZDR serving route: {String(data.evidence.zdr)}</p>
      <p className="mono">Gateway request: {data.evidence.requestId}</p>
      {data.evidence.sourceRasterization?<p className="mono">
        PDF image SHA-256: {data.evidence.sourceRasterization.renderedPngSha256}
        / page {data.evidence.sourceRasterization.pageNumber}
      </p>:null}
      <details><summary>Untrusted extracted fields</summary>
        <pre>{JSON.stringify(data.observation,null,2)}</pre>
      </details>
      <p className="muted">These fields are untrusted T1 observations. A separate,
        independently source-verified T2 path is required before payment review.</p>
    </div>:null}
  </section>;
}
