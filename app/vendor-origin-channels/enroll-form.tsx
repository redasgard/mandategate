"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Vendor={organizationId:string;organizationName:string;vendorId:string;vendorName:string};
type ChannelKind="KNOWN_CALLBACK"|"TRUSTED_PORTAL"|"ERP_INTEGRATION"|"SYNTHETIC_FIXTURE";
const hints:Record<ChannelKind,string>={
  KNOWN_CALLBACK:"callback-record:verified-event-id",
  TRUSTED_PORTAL:"portal-event:verified-portal-event-id",
  ERP_INTEGRATION:"erp-entry:verified-entry-id",
  SYNTHETIC_FIXTURE:"synthetic-fixture:mandategate-demo-issuer-001",
};
export function VendorOriginChannelEnroll({vendors,sandboxDemoEnabled}:{vendors:Vendor[];sandboxDemoEnabled:boolean}) {
  const router=useRouter();
  const [selected,setSelected]=useState("0");
  const [kind,setKind]=useState<ChannelKind>("KNOWN_CALLBACK");
  const [reference,setReference]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<{
    id:string;createdAt:string;replayed:boolean;active:boolean;evidenceSha256:string;
  }|null>(null);
  const vendor=vendors[Number(selected)];
  const demoVendor=sandboxDemoEnabled && vendor?.organizationId==="org_demo" && vendor.vendorId==="vendor_northstar";
  const fictional=kind==="SYNTHETIC_FIXTURE";
  async function enroll(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);setResult(null);
    if(!vendor || !confirmed) {
      setError(fictional?"Acknowledge the source is fictional.":"Verify the independently known channel outside the invoice.");
      return;
    }
    setBusy(true);
    try{
      const response=await fetch("/api/admin/vendor-origin-channels",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          organizationId:vendor.organizationId,vendorId:vendor.vendorId,
          kind,independentEvidenceReference:reference.trim(),
          confirmedOutsideInvoice:!fictional,
          confirmedSyntheticSimulation:fictional,
        }),
      });
      const payload=await response.json();
      if(!response.ok)throw new Error(
        typeof payload?.error==="string"?payload.error:"CHANNEL_ENROLLMENT_FAILED",
      );
      setResult(payload.channel);
      router.refresh();
    }catch(err){
      setError(err instanceof Error?err.message:"CHANNEL_ENROLLMENT_FAILED");
    }finally{setBusy(false);}
  }
  return <section className="review-stage">
    <p className="eyebrow">Independent vendor registry / first</p>
    <h2>Enroll a known issuer channel before receiving its invoice</h2>
    <p className="muted">
      A known callback, vendor portal, or ERP integration must come from an
      independent source, not from the invoice's printed phone number, link,
      or bank details. This creates an accountable human enrollment assertion,
      not a cryptographic supplier verification or payment approval.
    </p>
    {vendors.length===0?<p className="error">No vendor is available to your admin organizations.</p>:
      <form className="review-grid" onSubmit={e=>void enroll(e)}>
        <label>Known vendor from the organization registry
          <select disabled={busy} value={selected} onChange={e=>{setSelected(e.target.value);setKind("KNOWN_CALLBACK");setReference("");setConfirmed(false);}}>
            {vendors.map((v,i)=><option key={v.organizationId+":"+v.vendorId} value={String(i)}>
              {v.organizationName} / {v.vendorName}
            </option>)}
          </select>
        </label>
        <label>Independent channel type
          <select disabled={busy} value={kind} onChange={e=>{setKind(e.target.value as ChannelKind);setReference("");setConfirmed(false);}}>
            <option value="KNOWN_CALLBACK">Previously known callback contact</option>
            <option value="TRUSTED_PORTAL">Trusted vendor portal</option>
            <option value="ERP_INTEGRATION">Pre-existing ERP integration</option>
            {demoVendor?<option value="SYNTHETIC_FIXTURE">Fictional Sandbox-only source (no real callback)</option>:null}
          </select>
        </label>
        <label>{fictional?"Fictional test reference":"Existing out-of-band enrollment evidence reference"}
          <input value={reference} onChange={e=>setReference(e.target.value)}
            placeholder={hints[kind]} maxLength={128} disabled={busy}/>
        </label>
        <label className="review-checkbox">
          <input type="checkbox" checked={confirmed} disabled={busy}
            onChange={e=>setConfirmed(e.target.checked)}/>
          {fictional
            ? "I confirm this is a fictional Sandbox demo. No supplier was contacted or authenticated."
            : "I independently verified the source channel outside the invoice. This reference corresponds to a real callback, portal, or ERP record."}
        </label>
        <button type="submit" disabled={busy || !vendor || !confirmed || reference.trim().length<16}>
          {busy?"Recording enrollment…":fictional?"Record fictional Sandbox source":"Record pre-invoice channel enrollment"}
        </button>
      </form>}
    {result?<div role="status">
      <p>{result.replayed?"Previously recorded enrollment reused.":"Enrollment recorded."}
        {" "}This is a human assertion, not external proof or payment authorization.</p>
      <p className="mono">Channel ID: {result.id}</p>
      <p className="mono">Evidence SHA-256: {result.evidenceSha256}</p>
      <p>Enrolled at: {result.createdAt}</p>
    </div>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </section>;
}
