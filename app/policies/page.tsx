import { OperationsHeader } from "@/app/components/operations-header";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { isRestrictedJudge } from "@/src/auth/judge-dashboard";
import { readPolicyConsole } from "@/src/policy/proposals";
import { PolicyPrepareForm, PolicyReviewForm, PolicyDisableForm } from "./policy-actions";

function money(cents:number){
  return "USD "+(cents/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}
export default async function PoliciesPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  if(await isRestrictedJudge(session.user.id))redirect("/judge");
  const data=await readPolicyConsole(session.user.id);
  return <main className="shell">
    <OperationsHeader active="policies" title="Policies & mandates"
      description="Review standing payment authority, inspect proposals, and revoke unsafe rules. AI suggestions alone cannot change policy."
      email={session.user.email}/>
    <section className="panel detail">
      <p className="eyebrow">Active policy authority</p>
      <h2>Standing auto-pay limits</h2>
      <p><Link href="/autopay">Manage autonomous standing mandates →</Link></p>
      <p className="muted">This stage supports <strong>stricter limits only</strong>.
        Raising auto-pay authority is deliberately excluded from this console.</p>
      {data.policies.length===0?<p className="empty">No active policies for an organization you administer.</p>:
        <div className="policy-list">{data.policies.map(p=>{
          const pending=data.proposals.find(x=>x.organizationId===p.organizationId&&x.status==="PROPOSED");
          return <article className="policy-card" key={p.id}>
            <div className="incident-heading">
              <p className="eyebrow">{p.organizationName}</p><span className="badge">Active</span>
            </div>
            <h3>{p.name}</h3>
            <p>Current maximum: <strong>{money(p.limitCents)}</strong></p>
            <p className="muted">Distinct imported PAID history: {p.paidHistory.count} rows
              {p.paidHistory.count?", median "+money(p.paidHistory.medianCents):" (none observed)"}.
              History is advisory, not payment authority.</p>
            {pending?<p className="muted">An unconfirmed proposal is pending below.
                Review, reject or activate it before preparing another.</p>:
              <PolicyPrepareForm organizationId={p.organizationId}
                currentLimitCents={p.limitCents}
                historyCount={p.paidHistory.count}
                historyMedianCents={p.paidHistory.medianCents}/>}
            <PolicyDisableForm policyId={p.id} expectedDigest={p.shutdownDigest}/>
          </article>;
        })}</div>}
    </section>
    {data.disabledPolicies.length>0?<section className="panel detail">
      <p className="eyebrow">Disabled authority</p>
      <h2>Inactive policies</h2>
      <p className="muted">These policies do not grant automatic payment authority.</p>
      <div className="policy-list">{data.disabledPolicies.map(p=>
        <article key={p.id} className="policy-card">
          <span className="badge">DISABLED</span>
          <h3>{p.name}</h3>
          <p>Previous cap: {money(p.limitCents)}</p>
          <p className="muted">Organization: {p.organizationId}</p>
        </article>)}</div>
    </section>:null}
    <section className="panel detail">
      <p className="eyebrow">Approval queue / separate from AI</p>
      <h2>Prepared policy changes</h2>
      {data.proposals.length===0?<p className="muted">No policy proposals yet. Prepare a stricter cap above to start a review.</p>:
        <div className="policy-list">{data.proposals.map(p=><article key={p.id} className="policy-card">
          <div className="incident-heading">
            <span className="badge">{p.status}</span>
            <span className="muted">{p.origin==="PAID_HISTORY"?"Imported PAID history":"Admin prepared"}</span>
          </div>
          <h3>{money(p.baseLimitCents)} → {money(p.proposedLimitCents)}</h3>
          <p className="muted">Organization: {p.organizationId} · Digest: <code>{p.digest.slice(0,16)}…</code>
            {" · "}Version: {p.version}</p>
          <p>Evidence: {p.sampleCount
            ?p.sampleCount+" historical PAID rows; median "+money(p.sampleMedianCents??0)
            :"explicit manual preparation, no inferred sample"}.
            Source digest: <code>{p.evidenceSha256.slice(0,16)}…</code></p>
          {p.status==="PROPOSED"
            ? <PolicyReviewForm proposal={p}/>
            : <p className="muted">Closed: {p.status}. {p.decisionExplanation??""}</p>}
        </article>)}</div>}
    </section>
  </main>;
}
