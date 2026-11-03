import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { OperationsHeader } from "@/app/components/operations-header";
import { pool } from "@/src/db/pool";
import { VendorOriginChannelEnroll } from "./enroll-form";
import {sandboxFictionalIssuerChannelAllowed} from "@/src/demo/sandbox-fictional-origin";

export default async function VendorOriginChannelPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const [vendors,channels]=await Promise.all([
    pool.query([
      "select v.id as vendor_id,v.name as vendor_name,",
      "o.id as organization_id,o.name as organization_name",
      "from vendors v join organizations o on o.id=v.organization_id",
      "join organization_admin_memberships m on m.organization_id=o.id",
      "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
      "order by o.name,v.name limit 200",
    ].join(" "),[session.user.id]),
    pool.query([
      "select ch.id,ch.kind,ch.vendor_id,v.name as vendor_name,",
      "ch.created_at,ch.active,ch.enrolled_evidence_sha256",
      "from vendor_origin_channels ch",
      "join vendors v on v.id=ch.vendor_id and v.organization_id=ch.organization_id",
      "join organization_admin_memberships m on m.organization_id=ch.organization_id",
      "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
      "order by ch.created_at desc limit 100",
    ].join(" "),[session.user.id]),
  ]);
  return <main className="shell mg-shell">
    <OperationsHeader active="documents" title="Supplier sources"
      context="SOURCE DOCUMENTS"
      description="For real suppliers, an out-of-band record must exist before invoices arrive. The clearly labeled Sandbox test supplier option does not authenticate a vendor; source document contents and AI observations can never enroll or change a trusted channel."
      email={session.user.email}/>
    <section className="panel detail">
      <VendorOriginChannelEnroll sandboxDemoEnabled={sandboxFictionalIssuerChannelAllowed("org_demo","vendor_northstar")} vendors={vendors.rows.map(row=>({
        organizationId:row.organization_id as string,
        organizationName:row.organization_name as string,
        vendorId:row.vendor_id as string,
        vendorName:row.vendor_name as string,
      }))}/>
      <section className="review-stage">
        <p className="eyebrow">Recorded channels / human assertions</p>
        <h2>Known registry entries</h2>
        <div className="table-wrap">
          <table><thead><tr>
            <th>Vendor / channel</th><th>Kind</th><th>Enrollment time</th><th>Status</th>
          </tr></thead><tbody>
            {channels.rows.map(row=><tr key={row.id}>
              <td>{row.vendor_name} <span className="mono">{row.id}</span></td>
              <td>{row.kind}</td>
              <td>{(row.created_at as Date).toISOString()}</td>
              <td>{row.kind==="SYNTHETIC_FIXTURE"?"PayPal Sandbox test source; no live supplier authentication":
                row.active===true?"Admin-attested channel":"Revoked"}</td>
            </tr>)}
          </tbody></table>
          {channels.rows.length===0?<p className="muted">No channel enrolled yet.</p>:null}
        </div>
        <p className="muted">
          Enrollment evidence is digest-bound. A self-reported reference does
          not independently authenticate a supplier. Existing channels cannot
          be backdated to satisfy an older invoice.
        </p>
      </section>
    </section>
  </main>;
}
