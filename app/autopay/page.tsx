import { OperationsHeader } from "@/app/components/operations-header";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {isRestrictedJudge} from "@/src/auth/judge-dashboard";
import {readAutopayMandateConsole} from "@/src/autonomy/mandates";
import {MandatePrepareForm,MandateDecisionForm} from "./mandate-actions";

export const dynamic="force-dynamic";
const money=(cents:number)=>"USD "+(cents/100).toLocaleString("en-US",{
  minimumFractionDigits:2,maximumFractionDigits:2,
});
export default async function AutopayPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  if(await isRestrictedJudge(session.user.id))redirect("/judge");
  const data=await readAutopayMandateConsole(session.user.id);
  return <main className="shell mg-shell">
    <OperationsHeader active="policies" title="Standing mandates"
      description="Delegate bounded authority once. Mandates are individually scoped, expiring, revocable, and never granted by an AI recommendation."
      context="POLICY / AUTONOMY" email={session.user.email}/>
    <section className="panel detail">
      <p className="eyebrow">Prepare / no payout</p>
      <h2>Propose a scoped standing mandate</h2>
      <p className="muted">Pick a trusted vendor, select a maximum per-payment amount,
        and choose a 1 to 30 day validity. Preparation never moves money. Activation
        requires a second exact-scope confirmation within 15 minutes. The current
        hackathon Sandbox payment fence still prevents automatic payouts.</p>
      {data.vendors.length===0?<p className="empty">No eligible vendors with exactly one
        trusted destination, one active policy and no unresolved vendor trust case.</p>:
        <MandatePrepareForm vendors={data.vendors}/>}
    </section>
    <section className="panel detail">
      <p className="eyebrow">Authority ledger / admin only</p>
      <h2>Prepared, active and revoked mandates</h2>
      {data.mandates.length===0?<p className="empty">No standing mandates. A general
        policy cap does not automatically grant unattended payment authority.</p>:
        <div className="policy-list">{data.mandates.map(g=><article className="policy-card" key={g.id}>
          <div className="incident-heading"><span className="badge">{g.state}</span>
            <span className="muted">{g.organizationId}</span></div>
          <h3>{g.vendorName}</h3>
          <p>Maximum per payment: <strong>{money(g.maxAmountCents)}</strong></p>
          <p>Lifetime budget: <strong>{money(g.maxTotalAmountCents)}</strong>
            {" · "}Payments: {g.maxPaymentCount}</p>
          <p className="muted">Reserved: {money(Number(g.reservedCents))}
            {" · "}{g.reservedCount} payment(s). Reservation is not proof of PayPal submission.</p>
          <p>Trusted recipient: <code>{g.destination}</code></p>
          <p className="muted">Source: <code>agent_api</code> · Expires {g.expiresAt}</p>
          <p className="muted">Exact digest: <code>{g.digest.slice(0,18)}…</code></p>
          <MandateDecisionForm mandate={g} currentUserId={session.user.id}/>
        </article>)}</div>}
      <p className="muted">Revocation prevents future dispatch selection. It cannot undo
        a PayPal payout already submitted. This page cannot submit payments.</p>
    </section>
  </main>;
}
