import Link from "next/link";
import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import {pool} from "@/src/db/pool";
import {DEMO_ORG_ID} from "@/src/demo/scenarios";
import {auth} from "@/src/auth/auth";
import {OperationsHeader} from "@/app/components/operations-header";
import {HistoricalSandboxProof} from "@/app/demo/historical-sandbox-proof";

/**
 * Archived provider evidence only. This route is safe to view:
 * it does not read live financial records, create a request or contact PayPal.
 * It must never be presented as proof of invoice-derived payout.
 */
export default async function SandboxEvidencePage(){
 const session=await auth.api.getSession({headers:await headers()});
 if(!session)redirect("/sign-in");
 const authorized=await pool.query(
  "select 1 from organization_admin_memberships where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true limit 1",
  [DEMO_ORG_ID,session.user.id],
 );
 if(authorized.rows.length!==1)notFound();
 return <main className="shell mg-shell">
  <OperationsHeader active="none" title="PayPal Sandbox integration evidence"
    description="Archived provider evidence from an earlier, separately authorized direct-agent payout. This page reads no live financial records and contacts no provider."
    email={session.user.email} context="EVIDENCE ARCHIVE"/>
  <Link className="back" href="/payments">← Payment records</Link>
  <section className="panel detail">
   <p className="eyebrow">Evidence archive / earlier Sandbox execution</p>
   <p className="muted">The recorded transaction below belongs to an earlier,
    separately authorized direct-agent payout. It did not originate from
    the fictional GLM-reviewed invoices in the current demonstration.</p>
   <HistoricalSandboxProof/>
   <p className="muted">This page performs no payment or provider verification.
    For current settlement, use an independently reconciled PayPal batch,
    item and signed webhook receipt.</p>
  </section>
 </main>;
}
