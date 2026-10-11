"use client";
import {useRouter} from "next/navigation";
import {useState} from "react";

const allowed=new Set(["application/pdf","image/png","image/jpeg"]);
export function EscalationReview({requestId,snapshotSha256,trustedDestinationCurrent}:{
  requestId:string;snapshotSha256:string;trustedDestinationCurrent:boolean;
}){
  const router=useRouter();
  const [explanation,setExplanation]=useState("");
  const [evidence,setEvidence]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  async function handle(action:"ACCEPT"|"DECLINE"){
    if(busy || explanation.trim().length<16 || !trustedDestinationCurrent)return;
    const question=action==="ACCEPT"
      ?"Accept this exact payment request and immediately attempt the PayPal Sandbox payout?"
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
        setNotice("Review approved; Sandbox execution state: "+
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
    <h2>Accept or decline the flagged payment</h2>
    <p className="muted">
      The reviewer may override a behavioral anomaly but can never override
      a mismatched trusted destination. The original automated decision
      remains in the activity trail. Accept defaults to immediate Sandbox
      payout with a separate server-side authority recheck.
    </p>
    {!trustedDestinationCurrent?<p className="error">
      Trusted destination changed. Resolve vendor trust before any approval.
    </p>:null}
    <label>Required explanation (16–2000 characters)
      <textarea value={explanation} maxLength={2000} rows={4}
        onChange={e=>setExplanation(e.target.value)}/>
    </label>
    <label>Supporting PDF, PNG or JPEG (optional, 1 MiB maximum)
      <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/png,image/jpeg"
        onChange={e=>setEvidence(e.target.files?.[0]??null)}/>
    </label>
    <div className="chips">
      <button type="button" disabled={busy||!trustedDestinationCurrent||explanation.trim().length<16}
        onClick={()=>void handle("DECLINE")}>
        {busy?"Reviewing…":"Decline without payout"}
      </button>
      <button type="button" disabled={busy||!trustedDestinationCurrent||explanation.trim().length<16}
        onClick={()=>void handle("ACCEPT")}>
        {busy?"Reviewing…":"Accept and execute PayPal Sandbox"}
      </button>
    </div>
    {notice?<p role="status" className="review-notice">{notice}</p>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </section>;
}
