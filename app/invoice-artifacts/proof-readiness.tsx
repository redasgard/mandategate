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
   detail:"Original document bytes recorded; still untrusted"},
  {name:"Document fields (T2)",count:c?.verifiedPdfClaims??0,
   detail:"Parser-backed fields independently reviewed"},
  {name:"Issuer/source check (T3)",count:c?.currentHumanOriginAttestations??0,
   detail:"Recorded out-of-band issuer assertion; requires review"},
  {name:"Exact payment approval (T4)",count:c?.authorizedBindings??0,
   detail:"Recorded frozen binding; requires independent authorization review"},
 ];
 return <section className="invoice-task-card" aria-label="Invoice verification readiness">
  <div className="invoice-proof-head">
   <div>
    <p className="eyebrow">Payment authority</p>
    <h2>Verification readiness</h2>
    <p className="muted">Organization-wide evidence counts only. They do not form a verified chain for any specific invoice, establish a genuine supplier, prove compliant AI processing, or authorize payment.</p>
   </div>
   <div className="invoice-overview-aside">
    <span>Invoice-to-payment gate</span>
    <strong>{readiness?"Blocked":"Not verified"}</strong>
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
     <p>{stage.count===0?"Missing":stage.count+" recorded"}</p>
     <p className="muted">{stage.detail}</p>
    </div>)}
   </div>
   <p className="invoice-small-note">
    Independently parsed PDF pages: {c.independentPdfPages}.
    Pre-existing non-synthetic issuer-channel/invoice pairs: {c.eligiblePreexistingChannelInvoicePairs}.
    Synthetic advisory observations: {c.consentedSyntheticGlmObservations}.
   </p>
   <p className="muted">
    Provider ZDR/no-training/capture settings require separate verification.
    Payment rows ({c.allPaymentExecutions}) require independent PayPal reconciliation
    even when present. Strict invoice-derived payout verification remains blocked.
   </p>
  </>:null}
  <p className="muted">
   Next: <Link href="/vendor-origin-channels">check known supplier sources</Link>,
   then open an uploaded invoice below to verify exact PDF evidence and review the payment binding.
   <Link href="/invoice-artifacts/privacy"> Review AI privacy requirements</Link>.
  </p>
 </section>;
}
