"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {AdvisoryErrorDetails} from "@/app/components/advisory-error";

type SourceMime="application/pdf"|"image/png"|"image/jpeg";
type Observation={
  status:string;reasonCodes:string[];paymentAuthorized:false;
  observation:unknown;
  evidence:{
    model:string;provider:string;requestId:string;
    sourceRasterization?:{
      sourceSha256:string;renderedPngSha256:string;
      rasterizerVersion:string;pageNumber:number;pageCount:number;
    }|null;
  };
};

/**
 * One invoice → one AI action. The hackathon never requires a paid account
 * ZDR entitlement. AI results remain untrusted and cannot release a payout.
 */
export function InvoiceVisionObservation({
  artifactId,artifactSha256,mimeType,
}:{artifactId:string;artifactSha256:string;mimeType:SourceMime}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [data,setData]=useState<Observation|null>(null);

  async function observe(){
    if(busy||data)return;
    setBusy(true);setError(null);
    try{
      const response=await fetch(
        "/api/admin/invoice-artifacts/"+encodeURIComponent(artifactId)+"/observe",
        {method:"POST"},
      );
      const body=await response.json();
      if(!response.ok)throw new Error(typeof body?.error==="string"
        ?body.error:"INVOICE_OBSERVATION_FAILED");
      setData(body.observation);
      // Refresh the independently rendered Neon record. Otherwise a prior
      // FAILED attempt remains visible under the successful result.
      router.refresh();
    }catch(e){
      setError(e instanceof Error?e.message:"INVOICE_OBSERVATION_FAILED");
    }finally{setBusy(false);}
  }

  return <section id="invoice-ai-analysis" className="review-stage">
    <p className="eyebrow">AI invoice analysis</p>
    <h2>Extract invoice details with GLM-5.3 Flash</h2>
    <p>The model proposes vendor, amount, currency and payment destination for
      review. AI output cannot verify a supplier, alter the trusted destination
      or authorize a PayPal transaction.</p>
    <p className="muted">Documents are sent to Experiential Labs for inference
      and may be retained under its terms. Use test data for this hackathon
      application. PDF pages are rendered on our server before analysis.</p>
    <p className="mono">Source: {mimeType} / {artifactSha256}</p>
    <button disabled={busy||Boolean(data)} type="button" onClick={()=>void observe()}>
      {busy?"Analyzing invoice…":"Analyze invoice with AI"}
    </button>
    {error?<AdvisoryErrorDetails code={error}/>:null}
    {data?<div role="status">
      <p>Analysis: <strong>{data.status}</strong></p>
      <p className="mono">Reason codes: {data.reasonCodes.join(", ")}</p>
      <p>Model: {data.evidence.model}; provider: {data.evidence.provider}</p>
      <p className="mono">Request: {data.evidence.requestId}</p>
      {data.evidence.sourceRasterization?<p className="mono">
        Document rendering: {data.evidence.sourceRasterization.renderedPngSha256}
      </p>:null}
      <details><summary>Suggested invoice facts</summary>
        <pre>{JSON.stringify(data.observation,null,2)}</pre>
      </details>
      <p className="muted">AI suggestions are advisory. Verify the original
        document and obtain the required payment approval before execution.</p>
    </div>:null}
  </section>;
}
