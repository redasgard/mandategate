"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";

type Case={
  id:string;vendorName:string;status:string;
  requestedDestination:string;trustedDestination:string|null;
};
export function VendorReverificationActions({item}:{item:Case}){
  const router=useRouter();
  const [action,setAction]=useState<"REJECT"|"SIMULATE_VERIFY">("REJECT");
  const [reason,setReason]=useState("");
  const [reference,setReference]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  async function resolve(){
    if(busy)return;
    setBusy(true);setError(null);setNotice(null);
    try{
      if(action==="SIMULATE_VERIFY"&&!confirmed)
        throw Error("Acknowledge explicitly that the verification is synthetic.");
      const response=await fetch(
        "/api/admin/vendor-reverification/"+encodeURIComponent(item.id),
        {method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            action,reason,evidenceReference:reference.trim(),
            confirmedSyntheticSimulation:confirmed,
          }),
        },
      );
      const payload=await response.json();
      if(!response.ok)throw Error(payload.error??"VENDOR_REVERIFICATION_FAILED");
      setNotice(action==="REJECT"
        ?"Suspicious destination rejected. Vendor trust unchanged."
        :"Simulated re-verification recorded. The original denied payment stays denied.");
      router.refresh();
    }catch(err){setError(err instanceof Error?err.message:"VENDOR_REVERIFICATION_FAILED");}
    finally{setBusy(false);}
  }
  return <section className="review-stage">
    <p className="eyebrow">Vendor trust case / financial boundary</p>
    <h2>{item.vendorName}</h2>
    <p>Case: <span className="mono">{item.id}</span></p>
    <p>Attempted destination (from untrusted payment request):
      <strong> {item.requestedDestination}</strong></p>
    <p>Current approved vendor destination: <strong>{item.trustedDestination??"None"}</strong></p>
    <p>Current case state: <strong>{item.status}</strong></p>
    {item.status==="REVERIFICATION_REQUIRED"?<>
      <label>Disposition
        <select value={action} onChange={e=>{setAction(e.target.value as typeof action);setConfirmed(false);}}>
          <option value="REJECT">Reject attempted destination, keep known trusted address</option>
          <option value="SIMULATE_VERIFY">Synthetic demo-only out-of-band verification</option>
        </select>
      </label>
      <label>Required reason (at least 16 characters)
        <textarea rows={3} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/>
      </label>
      <label>Evidence reference, clearly labeled synthetic
        <input value={reference} onChange={e=>setReference(e.target.value)}
          placeholder="synthetic-demo:reviewer-test-record-1234"/>
      </label>
      {action==="SIMULATE_VERIFY"?<label className="review-checkbox">
        <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
        I acknowledge this is a synthetic demonstration, not a real vendor confirmation.
        Only PayPal Sandbox trust records may be changed.
      </label>:null}
      <button disabled={busy||reason.trim().length<16||reference.length<28||
        (action==="SIMULATE_VERIFY"&&!confirmed)} onClick={()=>void resolve()}>
        {busy?"Recording exact trust resolution…":
          action==="REJECT"?"Reject destination without payment":
          "Record simulated out-of-band re-verification"}
      </button>
      {notice?<p role="status" className="review-notice">{notice}</p>:null}
      {error?<p role="alert" className="error">{error}</p>:null}
    </>:<p className="muted">Case is resolved. The original payment decision remains DENY.</p>}
  </section>;
}
