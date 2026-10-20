"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Organization={id:string;name:string};
const LIMIT_BYTES=10*1024*1024;
const types=new Set(["application/pdf","image/png","image/jpeg"]);

export function InvoiceArtifactUpload({organizations}:{organizations:Organization[]}) {
  const router=useRouter();
  const [organizationId,setOrganizationId]=useState(organizations[0]?.id??"");
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<{
    artifact:{artifactId:string;sha256:string;analysisStatus:string;replayed:boolean};
    reviewPath:string|null;
  }|null>(null);

  async function upload(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);setResult(null);
    if(!file || !organizationId){setError("Choose an organization and invoice file.");return;}
    if(!types.has(file.type)){setError("Choose a PDF, PNG, or JPEG file.");return;}
    if(file.size<1 || file.size>LIMIT_BYTES){setError("File must be nonempty and no larger than 10 MiB.");return;}

    setBusy(true);
    try{
      // Deliberately send the original bytes, not multipart, transformed text,
      // or extracted model output. The server independently checks all bounds.
      const response=await fetch("/api/admin/invoice-artifacts",{
        method:"POST",
        headers:{
          "Content-Type":file.type,
          "X-Mandategate-Organization-Id":organizationId,
        },
        body:file,
      });
      const payload=await response.json();
      if(!response.ok)throw new Error(
        typeof payload?.error==="string"?payload.error:"UPLOAD_FAILED",
      );
      setResult(payload);
      if(payload.reviewPath){
        router.push(payload.reviewPath);
        return;
      }
      router.refresh();
    }catch(err){
      setError(err instanceof Error?err.message:"UPLOAD_FAILED");
    }finally{setBusy(false);}
  }

  return <section className="invoice-task-card" aria-label="Upload an invoice">
    <div className="invoice-task-card-head">
      <span className="invoice-step-number">01</span>
      <div><h2>Upload your invoice</h2>
        <p className="muted">Drop in a PDF, PNG or JPEG.
          MandateGate stores the original and prepares it for AI review.</p>
      </div>
    </div>
    {organizations.length===0?
      <p className="error">Your account has no active organization for invoice review.</p>:
      <form className="invoice-upload-form" onSubmit={e=>void upload(e)}>
        <label>Organization
          <select value={organizationId} disabled={busy}
            onChange={e=>setOrganizationId(e.target.value)}>
            {organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        </label>
        <label>Invoice file (PDF, PNG, JPEG · max 10 MB)
          <input type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
            disabled={busy} onChange={e=>setFile(e.target.files?.[0]??null)}/>
        </label>
        {file?<p className="invoice-small-note">Selected: <strong>{file.name}</strong>
          {" · "}{(file.size/1024).toFixed(0)} KB</p>:null}
        <button className="invoice-primary-action" type="submit"
          disabled={busy||!file||!organizationId}>
          {busy?"Uploading invoice…":"Upload & review invoice →"}
        </button>
      </form>}
    {result?<div role="status" className="invoice-review-notes">
      <strong>Invoice stored</strong>
      <p>{result.artifact.replayed?"Existing invoice file reused.":"Ready for review."}</p>
      {result.reviewPath?<Link href={result.reviewPath}>Open invoice →</Link>:null}
      <details className="invoice-technical"><summary>File reference</summary>
        <p className="mono">SHA-256 {result.artifact.sha256}</p>
      </details>
    </div>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </section>;
}
