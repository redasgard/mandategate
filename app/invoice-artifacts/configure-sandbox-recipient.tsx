"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

export function ConfigureSandboxRecipient(){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  async function configure(){
    if(busy)return;
    setBusy(true);setError(null);
    try{
      const response=await fetch("/api/admin/paypal-sandbox-recipient",{
        method:"POST",
      });
      const data=await response.json();
      if(!response.ok || data.status!=="CONFIGURED")
        throw new Error(data.error??"SANDBOX_RECIPIENT_CONFIG_FAILED");
      setResult(data.changed
        ?"Northstar is linked to the PayPal Sandbox test recipient."
        :"Northstar's Sandbox recipient is already configured.");
      router.refresh();
    }catch(e){
      setError(e instanceof Error?e.message:"SANDBOX_RECIPIENT_CONFIG_FAILED");
    }finally{setBusy(false);}
  }
  return <div className="review-stage">
    <h3>Payment recipient</h3>
    <p>Bind Northstar to the preconfigured PayPal Sandbox test recipient.
      This action does not call PayPal, verify a live supplier, or authorize a payout.
      A separate invoice approval is still required before execution.</p>
    <button type="button" disabled={busy} onClick={()=>void configure()}>
      {busy?"Configuring recipient…":"Configure PayPal Sandbox recipient"}
    </button>
    {result?<p role="status">{result}</p>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </div>;
}
