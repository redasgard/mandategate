"use client";
import {useRouter} from "next/navigation";
import {useState} from "react";

type VendorOption={
  id:string;organizationId:string;name:string;destination:string;
  limitCents:number;policyId:string;
};
type MandateRow={
  id:string;vendorName:string;destination:string;maxAmountCents:number;
  digest:string;expiresAt:string;createdAt:string;state:string;
  preparedBy:string;active:boolean;
};
function cents(raw:string):number|null {
  if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw.trim()))return null;
  const [whole,fraction=""]=raw.trim().split(".");
  const value=Number(whole)*100+Number(fraction.padEnd(2,"0"));
  return Number.isSafeInteger(value)&&value>0&&value<=2_000_000_000?value:null;
}
async function mutate(path:string,body:unknown){
  const response=await fetch(path,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),
  });
  const parsed=await response.json() as {error?:string};
  if(!response.ok)throw Error(parsed.error??"AUTOPAY_OPERATION_FAILED");
}
export function MandatePrepareForm({vendors}:{vendors:VendorOption[]}) {
  const router=useRouter();
  const [vendorId,setVendorId]=useState(vendors[0]?.id??"");
  const [amount,setAmount]=useState("");
  const [days,setDays]=useState(7);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [done,setDone]=useState(false);
  const v=vendors.find(x=>x.id===vendorId);
  async function prepare(){
    const value=cents(amount);
    if(!v||value===null||value>v.limitCents){
      setError("The amount must be positive and no higher than the current vendor/policy cap.");return;
    }
    setBusy(true);setError(null);
    try{
      await mutate("/api/admin/autopay-mandates",{
        organizationId:v.organizationId,vendorId:v.id,maxAmountCents:value,validityDays:days,
      });
      setAmount("");setDone(true);router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"AUTOPAY_PREPARE_FAILED");}
    finally{setBusy(false);}
  }
  return <div className="review-stage">
    <label>Vendor with independently managed trusted destination
      <select value={vendorId} onChange={e=>setVendorId(e.target.value)}>
        {vendors.map(v=><option key={v.organizationId+":"+v.id} value={v.id}>
          {v.name} · {v.organizationId}</option>)}</select></label>
    {v?<p className="muted">Trusted receiver: <code>{v.destination}</code>.
      Maximum current cap: USD {(v.limitCents/100).toFixed(2)}.</p>:null}
    <label>Maximum unattended payment, USD
      <input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}
        placeholder="e.g. 50.00" maxLength={11}/></label>
    <label>Validity, days
      <select value={days} onChange={e=>setDays(Number(e.target.value))}>
        {[1,3,7,14,30].map(d=><option key={d} value={d}>{d} days</option>)}
      </select></label>
    <button disabled={busy} type="button" onClick={()=>void prepare()}>Prepare inert mandate</button>
    {done?<p role="status">Prepared. Review the exact scope below and confirm separately.</p>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </div>;
}
export function MandateDecisionForm({mandate,currentUserId}:{
  mandate:MandateRow;currentUserId:string;
}) {
  const router=useRouter();
  const [confirmation,setConfirmation]=useState("");
  const [explanation,setExplanation]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [success,setSuccess]=useState<string|null>(null);
  const isPrepared=mandate.state==="PREPARED"&&mandate.preparedBy===currentUserId;
  const mayRevoke=mandate.state==="ACTIVE"||mandate.state==="EXPIRED"&&mandate.active;
  if(!isPrepared&&!mayRevoke)return <p className="muted">This record cannot grant further authority.</p>;
  const action=isPrepared?"ACTIVATE" as const:"REVOKE" as const;
  const required=isPrepared?"ENABLE AUTOPAY":"REVOKE";
  async function decide(){
    if(confirmation!==required||explanation.trim().length<16){
      setError("Enter the exact confirmation and a reason of at least 16 characters.");return;
    }
    setBusy(true);setError(null);setSuccess(null);
    try{
      await mutate("/api/admin/autopay-mandates/"+encodeURIComponent(mandate.id),{
        action,expectedDigest:mandate.digest,confirmation:required,explanation,
      });
      setSuccess(action==="ACTIVATE"?"Mandate activated.":"Mandate revoked.");
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"AUTOPAY_DECISION_FAILED");}
    finally{setBusy(false);}
  }
  return <div className="review-stage">
    <p className="muted">{isPrepared
      ?"Activation may enable future autonomous dispatch when a separately reviewed runner is deployed. You are not authorizing a particular payout here."
      :"Revocation immediately removes standing eligibility for future requests."}</p>
    <label>Explanation of this consequential action
      <textarea rows={3} maxLength={2000} value={explanation}
        onChange={e=>setExplanation(e.target.value)}/></label>
    <label>Type {required} to confirm the exact current mandate
      <input type="text" maxLength={18} autoComplete="off"
        value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
    <button type="button" disabled={busy||confirmation!==required}
      className={isPrepared?undefined:"policy-outline"}
      onClick={()=>void decide()}>{isPrepared?"Activate this exact mandate":"Revoke standing authorization"}</button>
    {success?<p role="status">{success}</p>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </div>;
}
