"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

type Organization={id:string;name:string};
type Counts={
 invoiceArtifacts:number;
 independentPdfPages:number;
 verifiedPdfClaims:number;
 eligiblePreexistingChannelInvoicePairs:number;
 currentHumanOriginAttestations:number;
 authorizedBindings:number;
 consentedSyntheticGlmObservations:number;
 invoicePaymentRequests:number;
 allPaymentExecutions:number;
};
type Readiness={
 contract:string;
 organizationId:string;
 status:"BLOCKED";
 payoutAuthorized:false;
 modelOrPaymentRequestsMade:false;
 counts:Counts;
 blockers:string[];
};

export function InvoiceProofReadiness({organizations,preferredOrganizationId}:{organizations:Organization[];preferredOrganizationId?:string}){
 const initialOrganizationId=preferredOrganizationId && organizations.some(org=>org.id===preferredOrganizationId)
  ? preferredOrganizationId : organizations[0]?.id??"";
 const [organizationId,setOrganizationId]=useState(initialOrganizationId);
 const [refresh,setRefresh]=useState(0);
 const [readiness,setReadiness]=useState<Readiness|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);

 useEffect(()=>{
  if(!organizationId)return;
  const controller=new AbortController();
  setLoading(true);
  setError("");
  setReadiness(null);
  fetch("/api/admin/gate-h/readiness?organizationId="+encodeURIComponent(organizationId),{
   credentials:"same-origin",cache:"no-store",signal:controller.signal,
  }).then(async response=>{
   if(!response.ok)throw Error("READINESS_UNAVAILABLE");
   const data=await response.json() as {readiness?:Readiness};
   if(data.readiness?.contract!=="mandategate/gate-h-readonly-inventory/v1"||
      data.readiness?.organizationId!==organizationId||
      data.readiness?.status!=="BLOCKED"||
      data.readiness?.payoutAuthorized!==false||
      data.readiness?.modelOrPaymentRequestsMade!==false)
    throw Error("READINESS_CONTRACT_INVALID");
   return data.readiness;
  }).then(data=>{
   if(!controller.signal.aborted)setReadiness(data);
  }).catch(()=>{
   if(!controller.signal.aborted)setError("Verification status is unavailable. No payment authority has been established.");
  }).finally(()=>{
   if(!controller.signal.aborted)setLoading(false);
  });
  return ()=>controller.abort();
 },[organizationId,refresh]);

 if(organizations.length===0)return null;
 const c=readiness?.counts;
 const stages=[
  {name:"Original invoice",count:c?.invoiceArtifacts??0,
   detail:"Original document saved; not yet trusted"},
  {name:"Document fields (T2)",count:c?.verifiedPdfClaims??0,
   detail:"Fields read from the PDF and checked by a reviewer"},
  {name:"Issuer/source check (T3)",count:c?.currentHumanOriginAttestations??0,
   detail:"Supplier confirmed out of band before the invoice arrived"},
  {name:"Exact payment approval (T4)",count:c?.authorizedBindings??0,
   detail:"Exact amount and recipient approved by a reviewer"},
 ];
 return <section className="invoice-task-card" aria-label="Invoice verification readiness">
  <div className="invoice-proof-head">
   <div>
    <p className="eyebrow">Payment authority</p>
    <h2>Verification readiness</h2>
    <p className="muted">A payment needs all four checks to pass on the exact same invoice. These counts show what your organization has recorded so far; they never authorize money on their own.</p>
   </div>
   <div className="invoice-overview-aside">
    <span>Invoice-to-payment gate</span>
    <strong>{readiness?"Awaiting checks":"Not verified"}</strong>
    <span className="invoice-status needs-review">No payment authorization</span>
   </div>
  </div>
  <div style={{display:"flex",alignItems:"end",gap:12,flexWrap:"wrap"}}>
   <label htmlFor="readiness-organization" style={{display:"grid",gap:6}}>
    Organization
    <select id="readiness-organization" value={organizationId}
     onChange={e=>setOrganizationId(e.currentTarget.value)}>
     {organizations.map(org=><option value={org.id} key={org.id}>{org.name}</option>)}
    </select>
   </label>
   <button type="button" onClick={()=>setRefresh(value=>value+1)} disabled={loading}>
    Refresh evidence
   </button>
  </div>
  {loading?<p role="status" className="muted">Checking recorded evidence…</p>:null}
  {error?<p role="alert">{error}</p>:null}
  {c ? <>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:12}}>
    {stages.map(stage=><div className="invoice-proof-stage" key={stage.name}>
     <strong>{stage.name}</strong>
     <p>{stage.count===0?"Not yet recorded":stage.count+" recorded"}</p>
     <p className="muted">{stage.detail}</p>
    </div>)}
   </div>
   <p className="invoice-small-note">
    Parsed PDF pages: {c.independentPdfPages}.
    Eligible supplier-source matches: {c.eligiblePreexistingChannelInvoicePairs}.
    Advisory AI observations: {c.consentedSyntheticGlmObservations}.
   </p>
   <p className="muted">
    AI suggestions are advisory. Recorded payments ({c.allPaymentExecutions}) still need
    independent PayPal reconciliation before they count as settled.
   </p>
  </>:null}
  <p className="muted">
   Next: enroll a known supplier source, then open an invoice below to check the PDF
   evidence and the payment approval.
   <Link href="/invoice-artifacts/privacy"> AI privacy details</Link>.
  </p>
 </section>;
}
