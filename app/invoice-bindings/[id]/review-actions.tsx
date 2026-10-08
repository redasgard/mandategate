"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InvoiceReviewActions({id,expectedTupleSha256}:{id:string;expectedTupleSha256:string}) {
  const [reason,setReason]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const router=useRouter();
  const submit=async(action:"APPROVE"|"REJECT")=>{
    if(busy)return;
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
  return <section>
    <h2>Reviewer action</h2>
    <p>Approval authorizes only the frozen values above. It cannot enroll a new receiver or execute PayPal directly.</p>
    <label htmlFor="review-reason">Independent review reason</label>
    <textarea id="review-reason" value={reason} onChange={e=>setReason(e.target.value)}
      maxLength={2000} rows={3} placeholder="Describe the trusted source/contact checked and matching payment facts" />
    <label style={{display:"block",marginTop:"1rem"}}>
      <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />
      {" "}I independently confirmed the source and exact frozen payment tuple, not merely the invoice's printed claims.
    </label>
    {error?<p role="alert">{error}</p>:null}
    <div style={{display:"flex",gap:"1rem",marginTop:"1rem"}}>
      <button disabled={busy||!confirmed||reason.trim().length<12} onClick={()=>void submit("APPROVE")}>
        Approve this exact tuple
      </button>
      <button disabled={busy||reason.trim().length<12} onClick={()=>void submit("REJECT")}>
        Reject permanently
      </button>
    </div>
  </section>;
}
