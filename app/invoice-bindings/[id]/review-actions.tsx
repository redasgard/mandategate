"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InvoiceReviewActions({id,expectedTupleSha256,approvalBlocked}:{id:string;expectedTupleSha256:string;approvalBlocked:boolean}) {
  const [reason,setReason]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const router=useRouter();
  const submit=async(action:"APPROVE"|"REJECT")=>{
    if(busy)return;
    if(action==="APPROVE"&&approvalBlocked){setError("Historical AP risk prevents approval; refresh and investigate.");return;}
    if(reason.trim().length<12){setError("A specific review reason of at least 12 characters is required.");return;}
    if(action==="APPROVE"&&!confirmed){setError("Explicit independent-source confirmation is required.");return;}
    setBusy(true);setError(null);
    try{
      const result=await fetch("/api/admin/invoice-bindings/"+encodeURIComponent(id),{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,expectedTupleSha256,reason}),
      });
      const data=await result.json();
      if(!result.ok)throw new Error(data.error??"REVIEW_REJECTED");
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"REVIEW_FAILED");}
    finally{setBusy(false);}
  };
  return <section className="invoice-task-card" aria-label="Authorize payment">
    <div className="invoice-task-card-head">
      <span className="invoice-step-number">✓</span>
      <div><h3>Ready for your decision</h3>
        <p className="muted">Approval locks the exact details shown above.
          It does not send money. You'll confirm PayPal execution separately.</p></div>
    </div>
    <label>Why are you approving or rejecting this payment?
      <textarea id="review-reason" value={reason} onChange={e=>setReason(e.target.value)}
        maxLength={2000} rows={2}
        placeholder="I checked the original invoice and the registered recipient."/>
    </label>
    <label className="review-checkbox invoice-confirm-check">
      <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />
      <span>I verified the supplier source and exact amount and recipient,
        not just what the invoice or AI suggested.</span>
    </label>
    {approvalBlocked?<div className="invoice-review-notes" role="alert">
      This payment has unresolved history risks. Approval is disabled.</div>:null}
    <div className="invoice-action-row">
      <button type="button" className="invoice-primary-action"
        disabled={busy||approvalBlocked||!confirmed||reason.trim().length<12}
        onClick={()=>void submit("APPROVE")}>
        {busy?"Recording decision…":"Approve payment →"}
      </button>
      <button type="button" className="invoice-ghost-button"
        disabled={busy||reason.trim().length<12}
        onClick={()=>void submit("REJECT")}>Reject invoice</button>
    </div>
    {error?<p className="error" role="alert">{error}</p>:null}
  </section>;
}
