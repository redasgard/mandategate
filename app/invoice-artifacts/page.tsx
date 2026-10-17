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
    "a.analysis_status,a.created_at,",
    "case when jsonb_typeof(o.extraction #> '{vendor_name,value}')='string'",
    "then nullif(btrim(left(o.extraction #>> '{vendor_name,value}',80)),'')",
    "else null end as ai_vendor,",
    "case when jsonb_typeof(o.extraction #> '{invoice_number,value}')='string'",
    "then nullif(btrim(left(o.extraction #>> '{invoice_number,value}',80)),'')",
    "else null end as ai_invoice,",
    "case when jsonb_typeof(o.extraction #> '{total_amount_decimal,value}')='string'",
    "and (o.extraction #>> '{total_amount_decimal,value}') ~ '^[0-9]{1,12}[.][0-9]{2}$'",
    "then (o.extraction #>> '{total_amount_decimal,value}')",
    "else null end as ai_amount,",
    "case when jsonb_typeof(o.extraction #> '{currency,value}')='string'",
    "and (o.extraction #>> '{currency,value}') in ('USD','EUR','GBP')",
    "then (o.extraction #>> '{currency,value}')",
    "else null end as ai_currency",
    "from invoice_artifacts a",
    "join organization_admin_memberships m on m.organization_id=a.organization_id",
    "and m.user_id=$1 and m.role='ADMIN' and m.active=true",
    "left join invoice_image_observations o on o.artifact_id=a.id",
    "and o.organization_id=a.organization_id",
    "and o.input_sha256=a.sha256",
    "and o.state='ESCALATE' and o.error_code is null",
    "and o.reason_codes @> jsonb_build_array('SYNTHETIC_NON_ZDR_TEST_ONLY')",
    "and exists (select 1 from invoice_synthetic_non_zdr_test_consents c",
    "where c.organization_id=a.organization_id and c.artifact_id=a.id",
    "and c.source_sha256=a.sha256)",
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
        Saved AI suggestions below are unverified text from consented fictional documents.
        They may be wrong and do not establish the vendor, issuer, invoice total, or payment
        authority. Viewing this list makes no AI or PayPal request.</p>
      <p><Link href="/vendor-origin-channels">1. Enroll independently known vendor origin channel (before invoice intake)</Link></p>
      <p><Link href="/invoice-artifacts/privacy">Check GLM account privacy metadata</Link></p>
      <InvoiceArtifactUpload organizations={organizations.rows.map(row=>({
        id:row.id as string,name:row.name as string,
      }))}/>
      {result.rows.length===0?<p>No stored invoice artifacts found for your authorized organizations.</p>:
        <div className="table-wrap"><table>
          <thead><tr><th>Document</th><th>Saved AI suggestions (unverified)</th><th>Review status</th><th>Created</th></tr></thead>
          <tbody>{result.rows.map(row=><tr key={row.id}>
            <td data-label="Document"><Link href={"/invoice-artifacts/"+encodeURIComponent(row.id)}>
              Review document →</Link>
              <p className="mono">{String(row.id).slice(0,18)}…</p>
              <p className="muted">{row.mime_type} / SHA {String(row.sha256).slice(0,12)}…</p>
            </td>
            <td data-label="Unverified AI suggestions">
              {row.ai_invoice || row.ai_vendor || row.ai_amount ?
                <div>
                  <p><strong>Invoice suggestion:</strong> {row.ai_invoice ?? "Not observed"}</p>
                  <p><strong>Vendor suggestion:</strong> {row.ai_vendor ?? "Not observed"}</p>
                  <p><strong>Amount suggestion:</strong> {
                    row.ai_currency && ["USD","EUR","GBP"].includes(row.ai_currency)
                      ? row.ai_currency+" " : ""}{row.ai_amount ?? "Not observed"}</p>
                  <p className="muted">Saved AI only. Not T2 verification, issuer proof, or payment approval.</p>
                </div> : <span className="muted">No eligible saved AI suggestions.</span>}
            </td>
            <td data-label="Review status">{row.analysis_status}</td>
            <td data-label="Created">{(row.created_at as Date).toISOString()}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </main>;
}
