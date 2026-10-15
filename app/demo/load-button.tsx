"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

export function LoadDemoScenarios() {
  const router=useRouter();
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<string|null>(null);
  async function load(){
    if(loading)return;
    setLoading(true);setError(null);setResult(null);
    try {
      const response=await fetch("/api/admin/demo-scenarios",{method:"POST"});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error??"DEMO_SCENARIO_SETUP_FAILED");
      if(!Array.isArray(body.scenarios)||body.scenarios.length!==3)
        throw new Error("DEMO_RESULT_INVALID");
      setResult("Three synthetic decisions are available. No payout was submitted.");
      router.refresh();
    } catch(e){setError(e instanceof Error?e.message:"DEMO_SETUP_FAILED");}
    finally{setLoading(false);}
  }
  return <div className="review-stage">
    <button type="button" onClick={()=>void load()} disabled={loading}>
      {loading?"Checking synthetic scenarios…":"Load or replay three demo decisions"}
    </button>
    <p className="muted">Idempotent: repeating this action reuses the same three requests.
      Each decision uses the actual deterministic policy engine; PayPal execution stays disabled.</p>
    {result?<p role="status" className="review-notice">{result}</p>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </div>;
}
