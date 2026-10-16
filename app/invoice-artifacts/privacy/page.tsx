"use client";

import Link from "next/link";
import { useState } from "react";
import { AdvisoryErrorDetails } from "@/app/components/advisory-error";

type Receipt={
  checkedAt:string;
  accountOrgId:string;
  targetModel:string;
  accountZdr:boolean;
  providerRequiresZdr:boolean;
  providerRequiresNoTraining:boolean;
  promptCaptureDisabled:boolean;
  targetModelHasZdrCapability:boolean;
  documentBytesSubmitted:false;
  servingRouteVerified:false;
};

export default function PrivacyPreflightPage(){
  const [receipt,setReceipt]=useState<Receipt|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  async function check(){
    if(busy)return;
    setBusy(true);setReceipt(null);setError(null);
    try{
      const response=await fetch("/api/admin/experiential-privacy",{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"EXPERIENTIAL_PREFLIGHT_FAILED");
      setReceipt(data.receipt);
    }catch(e){setError(e instanceof Error?e.message:"EXPERIENTIAL_PREFLIGHT_FAILED");}
    finally{setBusy(false);}
  }
  return <main className="shell narrow">
    <Link className="back" href="/invoice-artifacts">← Invoice review</Link>
    <section className="panel detail">
      <p className="eyebrow">Gate H / Experiential Labs</p>
      <h1>GLM-5.3 Flash privacy preflight</h1>
      <p className="muted">Queries the connected gateway account identity, Zero Data Retention,
        provider no-training/ZDR policy, prompt-content capture setting, and available
        model route. No invoice bytes or model inference are sent during this check.</p>
      <p className="muted">This page tests the strict privacy lane for real or
        sensitive invoices. Full account ZDR may require a paid provider entitlement.
        An account-level privacy refusal is the expected safe result when the
        entitlement is unavailable; it does not prevent a separate fictional-only
        hackathon demonstration.</p>
      <p className="muted">For a synthetic demo, return to <Link href="/invoice-artifacts">
        Invoice intake</Link> and open a server-allowlisted fictional document.
        The admin must acknowledge possible retention and training before model
        inference. That consent is not proof of ZDR, document authenticity, or
        payment authority.</p>
      <button disabled={busy} onClick={()=>void check()}>Check live account privacy settings</button>
      {receipt?<div>
        <h2>Metadata policy checks passed</h2>
        <dl>
          <div><dt>Account organization</dt><dd>{receipt.accountOrgId}</dd></div>
          <div><dt>Checked at</dt><dd>{receipt.checkedAt}</dd></div>
          <div><dt>Model requested</dt><dd>{receipt.targetModel}</dd></div>
          <div><dt>Account ZDR</dt><dd>{String(receipt.accountZdr)}</dd></div>
          <div><dt>No training enforced</dt><dd>{String(receipt.providerRequiresNoTraining)}</dd></div>
          <div><dt>Prompt-content capture disabled</dt><dd>{String(receipt.promptCaptureDisabled)}</dd></div>
          <div><dt>Serving inference verified</dt><dd>No, requires separate real synthetic request</dd></div>
        </dl>
        <p className="muted">Do not interpret a metadata PASS as proof that a particular model response used a ZDR serving route.</p>
      </div>:null}
      {error?<div role="status">
        {error==="EXPERIENTIAL_ACCOUNT_ZDR_REQUIRED"
          ? <p className="muted">Full account ZDR is unavailable. The strict
              observation remains blocked and no invoice was submitted. The
              separate approved fictional-only demo may still be used with
              explicit retention-risk consent.</p> : null}
        <AdvisoryErrorDetails code={error} metadataOnly/>
      </div>:null}
    </section>
  </main>;
}
