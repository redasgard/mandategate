"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

function dollarsToCents(raw:string):number|null {
  if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw.trim()))return null;
  const [whole,fraction=""]=raw.trim().split(".");
  const cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
  return Number.isSafeInteger(cents)&&cents>0&&cents<=2_000_000_000?cents:null;
}
async function post(path:string,value:unknown) {
  const result=await fetch(path,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value),
  });
  const data=await result.json() as {error?:string};
  if(!result.ok)throw Error(data.error??"POLICY_OPERATION_FAILED");
}
export function PolicyPrepareForm({organizationId,currentLimitCents,historyCount,historyMedianCents}:{
  organizationId:string;currentLimitCents:number;historyCount:number;historyMedianCents:number;
}) {
  const router=useRouter();
  const [amount,setAmount]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function prepare(origin:"ADMIN_MANUAL"|"PAID_HISTORY"){
    const limit=dollarsToCents(amount);
    if(origin==="ADMIN_MANUAL"&&(limit===null||limit>=currentLimitCents)){
      setError("Enter an amount strictly below the current cap.");return;
    }
    setBusy(true);setError(null);
    try{
      await post("/api/admin/policy-proposals",origin==="ADMIN_MANUAL"
        ?{organizationId,origin,proposedLimitCents:limit}:{organizationId,origin});
      setAmount("");router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"POLICY_ERROR");}
    finally{setBusy(false);}
  }
  const canSuggest=historyCount>=3&&historyCount<=200&&historyMedianCents>0&&
    historyMedianCents<currentLimitCents;
  return <div className="review-stage">
    <label>Proposed lower auto-pay maximum (USD)
      <input inputMode="decimal" type="text" value={amount} onChange={e=>setAmount(e.target.value)}
        placeholder="e.g. 250.00" maxLength={11}/></label>
    <div className="policy-controls">
      <button type="button" disabled={busy} onClick={()=>void prepare("ADMIN_MANUAL")}>Prepare manual rule</button>
      {canSuggest?<button type="button" disabled={busy} className="policy-outline"
        onClick={()=>void prepare("PAID_HISTORY")}>Suggest from PAID history</button>:null}
    </div>
    {error?<p className="error" role="alert">{error}</p>:null}
    <p className="muted">Preparing creates an inert review record. It cannot modify the active cap or release a payment.</p>
  </div>;
}
export function PolicyReviewForm({proposal}:{proposal:{
  id:string;digest:string;proposedLimitCents:number;baseLimitCents:number;
  expiresAt:string;
}}) {
  const router=useRouter();
  const [amount,setAmount]=useState((proposal.proposedLimitCents/100).toFixed(2));
  const [explanation,setExplanation]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [success,setSuccess]=useState<string|null>(null);
  const expired=new Date(proposal.expiresAt).getTime()<=Date.now();
  async function commit(action:"EDIT"|"ACTIVATE"|"REJECT"){
    if(explanation.trim().length<16){setError("Explain the change in at least 16 characters.");return;}
    const limit=dollarsToCents(amount);
    if(action==="EDIT"&&(limit===null||limit>=proposal.baseLimitCents)){
      setError("The revised amount must tighten the original cap.");return;
    }
    setBusy(true);setError(null);setSuccess(null);
    try {
      await post("/api/admin/policy-proposals/"+encodeURIComponent(proposal.id),
        action==="EDIT"
          ?{action,expectedDigest:proposal.digest,explanation,proposedLimitCents:limit}
          :{action,expectedDigest:proposal.digest,explanation});
      setSuccess(action==="ACTIVATE"?"Policy activated.":action==="REJECT"?"Proposal rejected.":"Proposal revised.");
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"POLICY_OPERATION_FAILED");}
    finally{setBusy(false);}
  }
  return <div className="review-stage">
    <p className="muted">This proposal expires {proposal.expiresAt}. Activation replaces the current active limit and
      invalidates prior authority snapshots. This screen never submits PayPal payouts.</p>
    <label>Revised maximum (USD; applies only after separate activation)
      <input type="text" inputMode="decimal" maxLength={11} value={amount}
        onChange={e=>setAmount(e.target.value)}/></label>
    <label>Administrator explanation (required for each action)
      <textarea value={explanation} onChange={e=>setExplanation(e.target.value)}
        rows={3} maxLength={2000} placeholder="State why the current policy should be tightened or rejected."/></label>
    <div className="policy-controls">
      <button type="button" className="policy-outline" disabled={busy||expired}
        onClick={()=>void commit("EDIT")}>Save revised proposal</button>
      <button type="button" disabled={busy||expired}
        onClick={()=>void commit("ACTIVATE")}>Activate stricter policy</button>
      <button type="button" className="policy-outline" disabled={busy}
        onClick={()=>void commit("REJECT")}>Reject proposal</button>
    </div>
    {expired?<p role="status" className="muted">Expired proposals can only be rejected. Prepare a new one to reconsider.</p>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
    {success?<p role="status" className="review-notice">{success}</p>:null}
  </div>;
}
