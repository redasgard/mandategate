import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {pool} from "@/src/db/pool";
import {ApHistoryImport} from "./import-form";
import {loadAdminApBaselines} from "@/src/history/baselines";
export default async function ApHistoryPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const fictionalPreview=process.env.MANDATEGATE_RUNTIME_MODE==="neon-preview" &&
    process.env.MANDATEGATE_DISABLE_PAYMENTS==="1";
  const [orgs,imports,baselines]=await Promise.all([
    pool.query([
      "select o.id,o.name from organizations o",
      "join organization_admin_memberships m on m.organization_id=o.id",
      "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
      "order by o.name",
    ].join(" "),[session.user.id]),
    pool.query([
      "select i.id,i.source_sha256,i.source_record_count,i.accepted_row_count,",
      "i.quarantine_count,i.duplicate_count,i.created_at,o.name as organization_name",
      "from ap_imports i join organizations o on o.id=i.organization_id",
      "join organization_admin_memberships m on m.organization_id=i.organization_id",
      "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
      "order by i.created_at desc limit 30",
    ].join(" "),[session.user.id]),
    loadAdminApBaselines(session.user.id),
  ]);
  return <main className="shell">
    <Link className="back" href="/dashboard">← Dashboard</Link>
    <section className="panel detail">
      <p className="eyebrow">MandateGate / historical analysis</p>
      <h1>Evidence-backed AP baselines</h1>
      <p className="muted">
        Import an existing export. The original source is retained with a SHA-256
        fingerprint, normalized accepted observations, and quarantined rows.
        A historical CSV can never re-enroll a vendor's payment destination.
      </p>
      {fictionalPreview?<section className="review-stage" aria-label="Optional fictional AP export">
        <p className="eyebrow">Optional judge fixture / not real history</p>
        <h2>Try paid-invoice behavior without a payment</h2>
        <p className="muted">This static CSV contains five deliberately fictional historical
          PAID-status entries for Northstar Components. A status inside a fictional
          CSV is not PayPal settlement evidence, cannot enroll payment destinations
          and cannot authorize spending. Import only into the demo organization.</p>
        <p><a href="/demo/northstar-fictional-ap-history.csv" download>
          Download fictional Northstar AP history CSV →
        </a></p>
        <p className="muted">In the three-case lab, load the deterministic decisions
          before importing history. Imported records affect future risk checks only.
          Existing decisions are immutable and never retroactively reclassified.</p>
      </section>:null}
      <ApHistoryImport organizations={orgs.rows.map(r=>({id:r.id as string,name:r.name as string}))}/>
      <section className="review-stage">
        <p className="eyebrow">Deterministic imported history / read only</p>
        <h2>Vendor amount and payment cadence baselines</h2>
        <p className="muted">
          Only accepted, previously paid records count. Repeated import versions
          do not double-count invoice evidence. Historic payment destinations
          are intentionally excluded from trusted vendor authority.
        </p>
        <div className="table-wrap"><table>
          <thead><tr><th>Organization / vendor</th><th>Paid invoices</th>
            <th>Typical paid amount</th><th>Typical interval</th><th>Import versions</th>
          </tr></thead><tbody>
            {baselines.map(b=><tr key={b.organizationId+":"+b.vendorId}>
              <td>{b.organizationName} / {b.vendorName}</td>
              <td>{b.paidInvoiceCount}</td>
              <td>{b.medianAmountCents===null?"Insufficient data":
                new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(b.medianAmountCents/100)}</td>
              <td>{b.medianInvoiceCadenceDays===null?"Insufficient history":
                b.medianInvoiceCadenceDays+" days"}</td>
              <td>{b.historicalImportIds.length}</td>
            </tr>)}
          </tbody></table>
          {baselines.length===0?<p className="muted">No accepted paid history yet.</p>:null}
        </div>
      </section>
      <section className="review-stage">
        <p className="eyebrow">Verified import records</p>
        <h2>Versioned evidence sources</h2>
        <div className="table-wrap">
          <table><thead><tr><th>Organization</th><th>Recorded</th><th>Accepted</th><th>Quarantine</th><th>Source SHA</th></tr></thead>
            <tbody>{imports.rows.map(r=><tr key={r.id}>
              <td>{r.organization_name}</td>
              <td>{(r.created_at as Date).toISOString()}</td>
              <td>{r.accepted_row_count}</td><td>{r.quarantine_count}</td>
              <td className="mono">{String(r.source_sha256).slice(0,18)}…</td>
            </tr>)}</tbody></table>
          {imports.rows.length===0?<p className="muted">No historical imports yet.</p>:null}
        </div>
      </section>
    </section>
  </main>;
}
