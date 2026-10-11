import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {pool} from "@/src/db/pool";
import {ApHistoryImport} from "./import-form";
export default async function ApHistoryPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const [orgs,imports]=await Promise.all([
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
      <ApHistoryImport organizations={orgs.rows.map(r=>({id:r.id as string,name:r.name as string}))}/>
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
