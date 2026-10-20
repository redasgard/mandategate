import { OperationsHeader } from "@/app/components/operations-header";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {pool} from "@/src/db/pool";
import {listVendorTrustCases} from "@/src/vendor-trust/reverification";
import {VendorReverificationActions} from "./reverification-actions";

export default async function VendorsPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const [cases,vendors]=await Promise.all([
    listVendorTrustCases(session.user.id),
    pool.query([
      "select v.id,v.name,o.name as organization_name,",
      "vd.destination as trusted_destination",
      "from vendors v",
      "join organizations o on o.id=v.organization_id",
      "join organization_admin_memberships m on m.organization_id=v.organization_id",
      "left join lateral (select destination from vendor_destinations",
      "where vendor_id=v.id and trusted=true order by created_at desc,id desc limit 1) vd on true",
      "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
      "order by o.name,v.name limit 200",
    ].join(" "),[session.user.id]),
  ]);
  return <main className="shell">
    <OperationsHeader active="vendors" title="Vendors"
      description="Inspect trusted payment destinations and investigate changes before they can affect payouts."
      email={session.user.email}/>
    <section className="panel detail">
      <p className="eyebrow">Vendor directory / current authority</p>
      <h2>Trusted recipients</h2>
      <p className="muted">
        A printed or agent-supplied payment destination never changes a trusted
        vendor record. A destination mismatch is DENIED, opens a separate
        re-verification case, and cannot be overridden from an ordinary payment
        approval screen. The test vendor is bound to PayPal Sandbox.
      </p>
      <div className="table-wrap"><table>
        <thead><tr><th>Organization</th><th>Vendor</th><th>Trusted destination</th></tr></thead>
        <tbody>{vendors.rows.map(v=><tr key={v.id}>
          <td>{v.organization_name}</td><td>{v.name}</td>
          <td className="mono">{v.trusted_destination??"Not configured"}</td>
        </tr>)}</tbody>
      </table></div>
      <section className="review-stage">
        <p className="eyebrow">Risk alerts / destination mismatch</p>
        <h2>Re-verification incidents</h2>
        <p className="muted">
          Original DENY decisions are final for each submitted invoice, even
          after a separately authorized trust-record transition.
        </p>
        {cases.length===0?<p className="muted">No destination mismatch cases recorded.</p>:
          cases.map(c=><VendorReverificationActions key={c.id} item={{
            id:c.id,vendorName:c.vendor_name,
            status:c.resolution??"REVERIFICATION_REQUIRED",
            requestedDestination:c.requested_destination,
            trustedDestination:c.current_trusted_destination??null,
          }}/>)}
      </section>
    </section>
  </main>;
}
