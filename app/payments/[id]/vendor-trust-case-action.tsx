"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";

export function StartVendorTrustInvestigation({requestId}:{requestId:string}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function start(){
    if(busy)return;
    if(!window.confirm(
      "Open a separate vendor recipient investigation? The original payment stays DECLINED. "+
      "This does NOT approve a recipient, make a payout, or authenticate a supplier."
    ))return;
    setBusy(true);setError(null);
    try{
      const response=await fetch("/api/admin/payments/"+encodeURIComponent(requestId)+"/vendor-trust-case",{
        method:"POST",
      });
      const result=await response.json();
      if(!response.ok || !result.case?.caseId)
        throw Error(String(result.error??"VENDOR_TRUST_CASE_FAILED"));
      router.push("/vendors?payment="+encodeURIComponent(requestId)+"#trust-review");
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"VENDOR_TRUST_CASE_FAILED");}
    finally{setBusy(false);}
  }
  return <section className="mg-surface mg-trust-followup" aria-label="Continue vendor trust investigation">
    <p className="mg-eyebrow">DECLINED / RECIPIENT INVESTIGATION</p>
    <h2>Open a separate vendor trust case</h2>
    <p>
      This escalated request has been declined, so it cannot be paid.
      A new trust case can record the disputed destination and route it
      to the Sandbox-only verification demonstration. The case is not
      a payment approval or evidence that the vendor was contacted.
    </p>
    <button type="button" disabled={busy} onClick={()=>void start()}>
      {busy?"Opening investigation…":"Open vendor trust investigation"}
    </button>
    {error?<p className="error" role="alert">{error}</p>:null}
  </section>;
}
