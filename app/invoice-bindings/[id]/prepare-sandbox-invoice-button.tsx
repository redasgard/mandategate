"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";

export function PrepareSandboxInvoiceButton({bindingId}:{bindingId:string}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const router=useRouter();
  const prepare=async()=>{
    if(busy)return;
    setBusy(true);setError(null);
    try{
      const response=await fetch(
        "/api/admin/invoice-bindings/"+encodeURIComponent(bindingId)+"/prepare-sandbox",
        {method:"POST"},
      );
      const body=await response.json().catch(()=>({}));
      if(!response.ok||typeof body.requestId!=="string")
        throw new Error(body.error??"SANDBOX_PREPARE_FAILED");
      router.push("/payments/"+encodeURIComponent(body.requestId));
      router.refresh();
    }catch(e){
      setError(e instanceof Error?e.message:"SANDBOX_PREPARE_FAILED");
    }finally{setBusy(false);}
  };
  return <div className="review-stage">
    <p className="eyebrow">PayPal Sandbox payment preparation</p>
    <p>This supplier is a PayPal Sandbox test record.
      Preparing records the reviewed invoice request; it does not pay.
      A separate explicit payment action appears on the next screen.</p>
    <button type="button" disabled={busy} onClick={()=>void prepare()}>
      {busy?"Preparing…":"Prepare USD 1.01 for PayPal execution"}
    </button>
    {error?<p role="alert" className="error">{error}</p>:null}
  </div>;
}
