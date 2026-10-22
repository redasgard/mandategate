"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState} from "react";

const allowed=new Set(["application/pdf","image/png","image/jpeg"]);
export function EscalationReview({requestId,snapshotSha256,trustedDestinationCurrent,payoutsDisabled=false,
  requestedDestination,currentTrustedDestination}:{
  requestId:string;snapshotSha256:string;trustedDestinationCurrent:boolean;payoutsDisabled?:boolean;
  requestedDestination?:string;currentTrustedDestination?:string;
}){
  const router=useRouter();
  const [explanation,setExplanation]=useState("");
  const [evidence,setEvidence]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  async function handle(action:"ACCEPT"|"DECLINE"){
    if((action==="ACCEPT" && payoutsDisabled) || busy || explanation.trim().length<16 ||
       (action==="ACCEPT" && !trustedDestinationCurrent))return;
    const question=action==="ACCEPT"
      ?"Approve this exact payment request and submit the payment now?"
      :"Decline this payment request permanently without issuing a payout?";
    if(!window.confirm(question))return;
    setBusy(true);setError(null);setNotice(null);
    try{
      let evidenceMimeType:string|undefined,evidenceBase64:string|undefined;
      if(evidence){
        if(evidence.size<1||evidence.size>1048576||!allowed.has(evidence.type))
          throw new Error("Evidence must be a PDF, JPEG or PNG no larger than 1 MiB.");
        const bytes=new Uint8Array(await evidence.arrayBuffer());
        let encoded="";
        for(let i=0;i<bytes.length;i+=8192)
          encoded+=String.fromCharCode(...bytes.subarray(i,i+8192));
        evidenceBase64=btoa(encoded);
        evidenceMimeType=evidence.type;
      }
      const res=await fetch("/api/admin/payments/"+encodeURIComponent(requestId)+"/review",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action,explanation,expectedSnapshotSha256:snapshotSha256,
          ...(evidenceBase64?{evidenceBase64,evidenceMimeType}:{}),
        }),
      });
      const body=await res.json();
      if(!res.ok)throw new Error(body.error??"REVIEW_FAILED");
      if(action==="ACCEPT"){
        // Confirmed immediate execution is a separate, preflighted endpoint:
        // failed PayPal credentials do not undo the immutable human review.
        const payout=await fetch("/api/admin/payments/"+encodeURIComponent(requestId)+"/execute",{
          method:"POST",
        });
        const executed=await payout.json().catch(()=>({}));
        if(!payout.ok)
          throw new Error("APPROVAL_RECORDED_BUT_PAYOUT_NOT_SUBMITTED: "+
            String(executed.error??payout.status));
        setNotice("Review approved; payment execution status: "+
          String(executed.execution?.status??"UNKNOWN"));
      }else{
        setNotice("Payment declined. No payout was submitted.");
      }
      router.refresh();
    }catch(e){
      setError(e instanceof Error?e.message:"ESCALATION_REVIEW_FAILED");
      router.refresh();
    }finally{setBusy(false);}
  }
  return <section className="review-stage">
    <p className="eyebrow">Human escalation / exact request state</p>
    <h2>{trustedDestinationCurrent?"Review the flagged payment":"Acceptance blocked by vendor trust"}</h2>
    <p className="muted">
      A reviewer can accept an eligible behavioral anomaly but cannot override
      the current trusted payment destination. Every human decision is recorded
      without changing the original automated outcome.
    </p>
    {!trustedDestinationCurrent?<div className="mg-review-block" role="alert" id="review-accept-blocker">
      <strong>Recipient no longer matches the trusted vendor destination.</strong>
      <p>
        This is a security block, not a missing form field. An explanation or
        attachment cannot authorize a new recipient. You may decline this
        payment without sending funds, or investigate the vendor record.
      </p>
      {requestedDestination?<div className="mg-review-recipient-diff">
        <div><span>Requested recipient · not trusted for this payment</span>
          <strong>{requestedDestination}</strong></div>
        <div><span>Current trusted record</span>
          <strong>{currentTrustedDestination??"Unavailable"}</strong></div>
      </div>:null}
      <ol className="mg-review-recovery">
        <li>Check the recipient against your vendor registry, not the invoice.</li>
        <li>Contact the vendor through an independently known callback, portal, or ERP channel.
          Preserve the confirmation evidence.</li>
        <li>If the change is unverified, decline this request. If it is genuine,
          the verified recipient must be registered through a separate authorized
          trust process, then the operations agent submits a new request.</li>
      </ol>
      <Link href={"/vendors?payment="+encodeURIComponent(requestId)+"#trust-review"}>
        Open exact trust-resolution steps and case status <span aria-hidden="true">↗</span>
      </Link>
      <p className="mg-review-block-note">
        To resolve this recipient mismatch, enter a reason and decline the
        payment without payout. On the payment detail, open a vendor trust
        investigation. An authorized reviewer can then record independently
        obtained evidence and approve or reject the new recipient. This
        payment stays declined; a fresh request requires a new policy decision.
      </p>
    </div>:null}
    {payoutsDisabled?<p className="mg-review-block-note" role="status">
      Payment execution is unavailable on this service. Declining remains available.
    </p>:null}
    <label>{trustedDestinationCurrent?"Required explanation (16–2000 characters)":"Reason for declining (16–2000 characters)"}
      <textarea value={explanation} maxLength={2000} rows={4}
        onChange={e=>setExplanation(e.target.value)}/>
    </label>
    <label>Supporting PDF, PNG or JPEG (optional, 1 MiB maximum)
      <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/png,image/jpeg"
        onChange={e=>setEvidence(e.target.files?.[0]??null)}/>
    </label>
    <div className="chips">
      <button type="button" disabled={busy||explanation.trim().length<16}
        onClick={()=>void handle("DECLINE")}>
        {busy?"Reviewing…":"Decline without payout"}
      </button>
      {trustedDestinationCurrent&&!payoutsDisabled
        ?<button type="button" disabled={busy||explanation.trim().length<16}
          onClick={()=>void handle("ACCEPT")}>
          {busy?"Reviewing…":"Approve and execute payment"}
        </button>
        :null}
    </div>
    {notice?<p role="status" className="review-notice">{notice}</p>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </section>;
}
