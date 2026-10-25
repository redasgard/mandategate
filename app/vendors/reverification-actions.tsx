"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";

type VerificationMethod=
  "KNOWN_CONTACT_CALLBACK"|"TRUSTED_VENDOR_PORTAL"|"SIGNED_VENDOR_INSTRUCTION";
type Action="REJECT"|"VERIFY";
type Case={
  id:string;vendorName:string;status:string;
  requestedDestination:string;trustedDestination:string|null;
  originalOutcome:string;originalPaymentStatus:string;
  verificationMethod?:VerificationMethod|null;
  resolutionActorId?:string|null;
  evidenceDigest?:string|null;
};

const methods:{value:VerificationMethod;label:string}[]=[
  {value:"KNOWN_CONTACT_CALLBACK",label:"Callback to the vendor's registered contact"},
  {value:"TRUSTED_VENDOR_PORTAL",label:"Vendor's existing authenticated portal"},
  {value:"SIGNED_VENDOR_INSTRUCTION",label:"Signed instruction confirmed through a trusted channel"},
];
const evidencePattern=/^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/;

function caseState(state:string){
  if(state==="VERIFIED")return "Recipient approved";
  if(state==="REJECTED")return "Destination rejected";
  if(state==="SIMULATED_REVERIFIED")return "Previous recipient update";
  return "Verification required";
}

export function VendorReverificationActions({item,recipientApprovalAvailable}:{
  item:Case;recipientApprovalAvailable:boolean;
}){
  const router=useRouter();
  const [action,setAction]=useState<Action>("REJECT");
  const [reason,setReason]=useState("");
  const [reference,setReference]=useState("");
  const [method,setMethod]=useState<VerificationMethod>("KNOWN_CONTACT_CALLBACK");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const reasonReady=reason.trim().length>=16;
  const referenceReady=evidencePattern.test(reference.trim());
  const canSubmit=!busy && reasonReady && referenceReady &&
    (action==="REJECT" || (recipientApprovalAvailable && confirmed));
  async function resolve(){
    if(!canSubmit)return;
    if(!window.confirm(
      action==="VERIFY"
        ?"Approve this exact recipient change using the independent evidence you reviewed? "+
         "The original payment will remain stopped."
        :"Reject this recipient change? The registered recipient will not change."
    ))return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const response=await fetch(
        "/api/admin/vendor-reverification/"+encodeURIComponent(item.id),
        {method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            action,reason,evidenceReference:reference.trim(),
            verificationMethod:action==="VERIFY"?method:null,
            confirmedIndependentVerification:action==="VERIFY"?confirmed:false,
          }),
        },
      );
      const payload=await response.json();
      if(!response.ok)throw Error(String(payload.error??"VENDOR_REVERIFICATION_FAILED"));
      setNotice(action==="REJECT"
        ?"Recipient change rejected. Registered payment destination unchanged."
        :"Recipient change approved and recorded. The original payment remains "+
          item.originalPaymentStatus+". Submit a new request for evaluation.");
      router.refresh();
    }catch(err){setError(err instanceof Error?err.message:"VENDOR_REVERIFICATION_FAILED");}
    finally{setBusy(false);}
  }
  const resolved=item.status!=="REVERIFICATION_REQUIRED";
  return <section className="review-stage" aria-label={"Recipient review for "+item.vendorName}>
    <p className="eyebrow">Vendor security / recipient change</p>
    <h2>{item.vendorName}</h2>
    <p className="mg-policy-meta">Case <code>{item.id}</code></p>
    <div className="mg-review-recipient-diff">
      <div><span>Requested recipient</span>
        <strong>{item.requestedDestination}</strong></div>
      <div><span>Registered recipient</span>
        <strong>{item.trustedDestination??"Not enrolled"}</strong></div>
    </div>
    <p>Case status: <strong>{caseState(item.status)}</strong></p>
    <p className="mg-source-note">Original payment: {item.originalOutcome} / {item.originalPaymentStatus}.
      This review cannot reopen or execute it.</p>
    {!resolved?<>
      <p className="muted">Independently confirm destination changes through an existing
        vendor contact or trusted channel. Never verify using contact details supplied
        in the disputed invoice. Record your findings before approving the recipient.</p>
      <label>Decision
        <select value={action} disabled={busy}
          onChange={e=>{setAction(e.target.value as Action);setConfirmed(false);}}>
          <option value="REJECT">Reject recipient change</option>
          {recipientApprovalAvailable
            ?<option value="VERIFY">Approve verified recipient</option>:null}
        </select>
      </label>
      {action==="VERIFY"?<label>Independent verification method
        <select value={method} disabled={busy}
          onChange={e=>{setMethod(e.target.value as VerificationMethod);setConfirmed(false);}}>
          {methods.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>:null}
      <label>Decision rationale (minimum 16 characters)
        <textarea rows={3} maxLength={2000} value={reason} disabled={busy}
          aria-describedby={"vendor-reason-help-"+item.id}
          placeholder="Describe the verification or why the recipient change was rejected."
          onChange={e=>setReason(e.target.value)}/>
      </label>
      <p id={"vendor-reason-help-"+item.id} className="mg-policy-meta">
        {reasonReady?"Rationale length accepted.":
          "At least 16 characters are required after trimming leading and trailing spaces."}
      </p>
      <label>Evidence reference (ticket, contract, or verification record)
        <input value={reference} maxLength={128} minLength={8} disabled={busy}
          aria-invalid={reference.length>0&&!referenceReady}
          aria-describedby={"vendor-evidence-help-"+item.id}
          onChange={e=>setReference(e.target.value)}
          placeholder="vendor-review/CASE-2841"/>
      </label>
      <p id={"vendor-evidence-help-"+item.id} className="mg-source-note">
        Use an existing internal record ID: 8 to 128 characters, starting with a
        letter or number; only letters, numbers, dots, underscores, colons,
        slashes and hyphens are accepted. The system stores its SHA-256 digest.
        {reference.length>0&&!referenceReady?<strong> Check the reference format.</strong>:null}
      </p>
      {action==="VERIFY"?<label className="review-checkbox">
        <input type="checkbox" checked={confirmed} disabled={busy}
          onChange={e=>setConfirmed(e.target.checked)}/>
        I independently verified the requested recipient using the selected method,
        reviewed the supporting evidence, and authorize updating this vendor's
        registered payment destination.
      </label>:null}
      <p className={"mg-form-readiness"+(canSubmit?" is-ready":"")} role="status">
        {busy?"Recording the decision securely…":
          !reasonReady?"Add a decision rationale of at least 16 characters.":
          !referenceReady?"Add a valid evidence reference before continuing.":
          action==="VERIFY"&&!confirmed?"Confirm independent verification before approving.":
          "Ready to record. The original payment will remain stopped."}
      </p>
      <button type="button" disabled={!canSubmit} onClick={()=>void resolve()}>
        {busy?"Recording decision…":
          action==="REJECT"?"Reject recipient change":"Approve new recipient"}
      </button>
      {notice?<p role="status" className="review-notice">{notice}</p>:null}
      {error?<p role="alert" className="error">{error}</p>:null}
    </>:<div className="mg-trust-resolution-record">
      <p>Decision recorded. The original payment remains {item.originalPaymentStatus}.</p>
      {item.verificationMethod
        ?<p>Verification method: {methods.find(m=>m.value===item.verificationMethod)?.label??"Recorded"}</p>
        :null}
      {item.resolutionActorId?<p>Reviewer: <code>{item.resolutionActorId}</code></p>:null}
      {item.evidenceDigest?<p>Evidence digest: <code>{item.evidenceDigest}</code></p>:null}
    </div>}
  </section>;
}
