"use client";
import {useRouter} from "next/navigation";
import {useState,type FormEvent} from "react";
type Organization={id:string;name:string};
export function ApHistoryImport({organizations}:{organizations:Organization[]}){
  const router=useRouter();
  const [orgId,setOrgId]=useState(organizations[0]?.id??"");
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<{
    importId:string;records:number;accepted:number;quarantined:number;
    duplicatesCollapsed:number;sourceSha256:string;replayed:boolean;
  }|null>(null);
  async function upload(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!file||!orgId)return;
    setBusy(true);setError(null);setResult(null);
    try{
      if(file.size===0||file.size>2*1024*1024)
        throw new Error("CSV must be nonempty and at most 2 MiB.");
      const response=await fetch("/api/admin/ap-history",{
        method:"POST",headers:{
          "Content-Type":"text/csv","X-Mandategate-Organization-Id":orgId,
        },body:file,
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body?.error??"AP_CSV_IMPORT_FAILED");
      setResult(body.import);router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"AP_CSV_IMPORT_FAILED");}
    finally{setBusy(false);}
  }
  return <section className="review-stage">
    <p className="eyebrow">Vendor behavioral context / historical only</p>
    <h2>Import AP history (CSV)</h2>
    <p className="muted">
      Historical exports are untrusted evidence. They never update trusted vendor
      payment destinations, policies or authorization. Malformed rows are quarantined.
      Reimporting identical bytes is idempotent.
    </p>
    <form className="review-grid" onSubmit={e=>void upload(e)}>
      <label>Organization
        <select value={orgId} onChange={e=>setOrgId(e.target.value)} disabled={busy}>
          {organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <label>Original UTF-8 CSV export (2 MiB maximum)
        <input type="file" accept=".csv,text/csv" disabled={busy}
          onChange={e=>setFile(e.target.files?.[0]??null)}/>
      </label>
      <button type="submit" disabled={busy||!file||!orgId}>
        {busy?"Importing immutable history…":"Import historical AP rows"}
      </button>
    </form>
    {result?<div role="status">
      <p>{result.replayed?"Existing import reused.":"Immutable import recorded."}</p>
      <p>Rows: {result.records}; accepted: {result.accepted};
         quarantined: {result.quarantined}; duplicate records: {result.duplicatesCollapsed}</p>
      <p className="mono">Source SHA-256: {result.sourceSha256}</p>
      <p className="muted">No payment, trusted destination change, or policy activation occurred.</p>
    </div>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </section>;
}
