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

  return <section className="review-stage">
    <p className="eyebrow">Demo document intake / untrusted</p>
    <h2>Upload an invoice to inspect</h2>
    <p className="muted">
      Signed-in admin upload, without agent credentials. Original bytes are
      hashed and stored as untrusted source material. No payment request,
      issuer authentication, or payout is created.
    </p>
    {organizations.length===0?
      <p className="error">No active admin organization membership is available.</p>:
      <form className="review-grid" onSubmit={e=>void upload(e)}>
        <label>Organization
          <select value={organizationId} disabled={busy}
            onChange={e=>setOrganizationId(e.target.value)}>
            {organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        </label>
        <label>Original PDF, PNG, or JPEG (maximum 10 MiB)
          <input type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
            disabled={busy} onChange={e=>setFile(e.target.files?.[0]??null)}/>
        </label>
        <button type="submit" disabled={busy || !file || !organizationId}>
          {busy?"Storing exact source bytes…":"Store invoice for independent review"}
        </button>
      </form>}
    {result?<div role="status">
      <p>Stored as <strong>{result.artifact.analysisStatus}</strong>.
        {result.artifact.replayed?" Existing artifact reused.":""}</p>
      <p className="mono">SHA-256: {result.artifact.sha256}</p>
      {result.reviewPath?
        <Link href={result.reviewPath}>Open PDF review</Link>:
        <p className="muted">Image retained as untrusted. It cannot directly authorize a payment.</p>}
    </div>:null}
    {error?<p role="alert" className="error">{error}</p>:null}
  </section>;
}
