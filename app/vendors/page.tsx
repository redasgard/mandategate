import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { pool } from "@/src/db/pool";
import { OperationsHeader } from "@/app/components/operations-header";
import { listVendorTrustCases } from "@/src/vendor-trust/reverification";
import { VendorReverificationActions } from "./reverification-actions";
import { VendorTrustResolutionGuide } from "./trust-resolution-guide";
import { readVendorTrustRequestContext } from "@/src/vendor-trust/review-context";

export default async function VendorsPage({searchParams}:{
  searchParams?:Promise<{payment?:string|string[]}>;
}={}) {
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const requested=(await searchParams)?.payment;
  const paymentId=typeof requested==="string"&&requested.length<=128?requested:undefined;
  const context=paymentId&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(paymentId)
    ?await readVendorTrustRequestContext(session.user.id,paymentId):null;
  const [cases,records]=await Promise.all([
    listVendorTrustCases(session.user.id),
    pool.query([
      "select v.id,v.name,o.name as organization_name,",
      "vd.destination as trusted_destination,vd.destination_count",
      "from vendors v",
      "join organizations o on o.id=v.organization_id",
      "join organization_admin_memberships m on m.organization_id=v.organization_id",
      "left join lateral (select min(destination) as destination,",
      "count(*)::int as destination_count from vendor_destinations",
      "where vendor_id=v.id and trusted=true) vd on true",
      "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
      "order by o.name,v.name limit 200",
    ].join(" "),[session.user.id]),
  ]);
  const trusted=records.rows.filter(v=>Number(v.destination_count)===1).length;
  return <main className="shell mg-shell">
    <OperationsHeader active="vendors" title="Vendors" context="VENDORS"
      description="Know exactly who can receive money, where it can go, and what needs independent re-verification."
      email={session.user.email}/>
    <div className="mg-dashboard">
      <section className="mg-vendor-summary" aria-label="Vendor trust overview">
        <div className="mg-surface mg-vendor-summary-item">
          <span>Visible vendors</span><strong>{records.rows.length}</strong>
          <small>Current active administrator scope · first 200</small>
        </div>
        <div className="mg-surface mg-vendor-summary-item">
          <span>Single trusted destination</span><strong>{trusted}</strong>
          <small>Observed trusted record, not proof of external issuer identity</small>
        </div>
        <div className="mg-surface mg-vendor-summary-item">
          <span>Destination trust cases</span><strong>{cases.length}</strong>
          <small>Recorded change investigations</small>
        </div>
      </section>
      <VendorTrustResolutionGuide paymentId={paymentId} context={context}/>
      <section className="mg-surface" aria-label="Trusted recipients">
        <div className="mg-table-head"><div><h2>Trusted recipients</h2>
          <p>Invoice instructions never overwrite these registered payment destinations.</p></div></div>
        {records.rows.length ? <div className="table-wrap">
          <table className="dashboard-table mg-ledger-table">
            <thead><tr><th>Vendor</th><th>Organization</th><th>Registered destination</th><th>Trust record</th></tr></thead>
            <tbody>{records.rows.map(v=>{
              const count=Number(v.destination_count);
              return <tr key={v.id}>
                <td data-label="Vendor"><strong>{v.name}</strong></td>
                <td data-label="Organization">{v.organization_name}</td>
                <td data-label="Registered destination" className="mono">
                  {count===1?v.trusted_destination:count>1?"Conflicting records":"Not enrolled"}
                </td>
                <td data-label="Trust record"><span className={"mg-mini-state "+(count===1?"allow":"deny")}>
                  {count===1?"Single trusted destination":count>1?"Requires investigation":"Not configured"}
                </span></td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <div className="mg-compact-empty">No vendors visible in your authorized organizations.</div>}
        <p className="mg-source-note">
          One current trusted destination is necessary, but does not alone authorize payment.
          Vendor identity and issuer evidence still require independent validation.
        </p>
      </section>
      <section id="vendor-trust-investigations" className="mg-surface mg-investigation-surface" aria-label="Vendor trust investigations">
        <div className="mg-table-head"><div><h2>Destination change investigations</h2>
          <p>Changes are separate trust events. Ordinary payment approval cannot resolve a mismatch.</p></div>
          <span className="mg-mini-state">{cases.length} recorded</span></div>
        <div className="mg-case-content">
          {cases.length ? <div className="mg-trust-cases">
            {[...cases].sort((a,b)=>Number(b.payment_request_id===paymentId)-Number(a.payment_request_id===paymentId)).map(c=><div key={c.id} id={"vendor-case-"+c.id}>
              <VendorReverificationActions item={{
              id:c.id,vendorName:c.vendor_name,
              status:c.resolution??"REVERIFICATION_REQUIRED",
              requestedDestination:c.requested_destination,
              trustedDestination:c.current_trusted_destination??null,
            }}/></div>)}
          </div> : <p className="mg-compact-empty">No destination mismatch cases have been recorded.</p>}
        </div>
      </section>
    </div>
  </main>;
}
