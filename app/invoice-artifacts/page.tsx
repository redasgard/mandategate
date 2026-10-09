import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { pool } from "@/src/db/pool";
import { InvoiceArtifactUpload } from "./upload-form";

export default async function InvoiceArtifactListPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const result=await pool.query([
    "select a.id,a.organization_id,a.mime_type,a.byte_size,a.sha256,",
    "a.analysis_status,a.created_at from invoice_artifacts a",
    "join organization_admin_memberships m on m.organization_id=a.organization_id",
    "and m.user_id=$1 and m.role='ADMIN' and m.active=true",
    "order by a.created_at desc,a.id desc limit 50",
  ].join(" "),[session.user.id]);
  const organizations=await pool.query([
    "select o.id,o.name from organizations o",
    "join organization_admin_memberships m on m.organization_id=o.id",
    "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
    "order by o.name,o.id",
  ].join(" "),[session.user.id]);
  return <main className="shell">
    <Link className="back" href="/dashboard">← Dashboard</Link>
    <section className="panel detail">
      <p className="eyebrow">Invoice origin review</p>
      <h1>Stored invoice artifacts</h1>
      <p className="muted">Only artifacts in your active admin organizations are shown.
        PDF source fields and independent issuer attestation must be checked
        separately from final exact-tuple approval.</p>
      <p><Link href="/vendor-origin-channels">1. Enroll independently known vendor origin channel (before invoice intake)</Link></p>
      <p><Link href="/invoice-artifacts/privacy">Check GLM account privacy metadata</Link></p>
      <InvoiceArtifactUpload organizations={organizations.rows.map(row=>({
        id:row.id as string,name:row.name as string,
      }))}/>
      {result.rows.length===0?<p>No stored invoice artifacts found for your authorized organizations.</p>:
        <div className="table-wrap"><table>
          <thead><tr><th>Artifact</th><th>Media</th><th>Source SHA</th><th>Created</th></tr></thead>
          <tbody>{result.rows.map(row=><tr key={row.id}>
            <td>{row.mime_type==="application/pdf"
              ?<Link href={"/invoice-artifacts/"+encodeURIComponent(row.id)}>{row.id}</Link>
              :row.id}</td>
            <td>{row.mime_type}</td>
            <td className="mono">{String(row.sha256).slice(0,16)}…</td>
            <td>{(row.created_at as Date).toISOString()}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </main>;
}
