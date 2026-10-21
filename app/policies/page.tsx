import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { isRestrictedJudge } from "@/src/auth/judge-dashboard";
import { OperationsHeader } from "@/app/components/operations-header";
import { readPolicyConsole } from "@/src/policy/proposals";
import { PolicyPrepareForm, PolicyReviewForm, PolicyDisableForm } from "./policy-actions";

function money(cents:number) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
}
export default async function PoliciesPage() {
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  if(await isRestrictedJudge(session.user.id))redirect("/judge");
  const data=await readPolicyConsole(session.user.id);
  const pending=data.proposals.filter(p=>p.status==="PROPOSED").length;
  return <main className="shell mg-shell">
    <OperationsHeader active="policies" title="Policies & mandates" context="POLICIES"
      description="Define what agents may request, what needs approval, and when spending authority expires."
      email={session.user.email}/>
    <div className="mg-dashboard">
      <section className="mg-vendor-summary" aria-label="Policy authority overview">
        <div className="mg-surface mg-vendor-summary-item"><span>Active policies</span>
          <strong>{data.policies.length}</strong><small>Approved organizational limits</small></div>
        <div className="mg-surface mg-vendor-summary-item"><span>Awaiting review</span>
          <strong>{pending}</strong><small>Proposals do not grant authority</small></div>
        <div className="mg-surface mg-vendor-summary-item"><span>Disabled</span>
          <strong>{data.disabledPolicies.length}</strong><small>Not eligible to authorize new payments</small></div>
      </section>
      <section className="mg-surface" aria-label="Standing payment authorization">
        <div className="mg-policy-hero">
          <div><p className="mg-eyebrow">AUTHORITY BOUNDARY</p>
            <h2>Policies define limits. Mandates authorize autonomy.</h2>
            <p>An inferred rule cannot activate itself. A policy cap alone never gives an agent permission to execute a payment.</p></div>
          <Link className="mg-primary-link" href="/autopay">Manage standing mandates ↗</Link>
        </div>
      </section>
      <section className="mg-surface" aria-label="Prepared policy proposals">
        <div className="mg-table-head"><div><h2>Prepared policy changes</h2>
          <p>Review the proposed limit, historical context and exact digest before taking action.</p></div>
          <span className="mg-mini-state">{pending} open</span></div>
        {data.proposals.length ? <div className="mg-policy-grid">
          {data.proposals.map(p=><article className="mg-policy-card" key={p.id}>
            <div className="mg-policy-card-top">
              <span className={"mg-mini-state "+(p.status==="PROPOSED"?"escalate":"")}>{p.status}</span>
              <span className="mg-policy-meta">{p.origin==="PAID_HISTORY"?"Imported history":"Admin prepared"}</span>
            </div>
            <h3>{money(p.baseLimitCents)} <span aria-hidden="true">→</span> {money(p.proposedLimitCents)}</h3>
            <p className="mg-policy-meta">Organization: {p.organizationId} · Version {p.version}</p>
            <p className="mg-policy-description">{p.sampleCount
              ?p.sampleCount+" imported PAID rows, median "+money(p.sampleMedianCents??0)
              :"No independent historical sample; explicit manual preparation"}.
              Historical AP evidence is advisory only.</p>
            <details className="mg-policy-detail">
              <summary>Evidence and exact proposal identity</summary>
              <p>Proposal digest: <code>{p.digest}</code></p>
              <p>Source digest: <code>{p.evidenceSha256}</code></p>
            </details>
            {p.status==="PROPOSED"?<PolicyReviewForm proposal={p}/>:
              <p className="mg-policy-meta">Closed: {p.status}. {p.decisionExplanation??""}</p>}
          </article>)}
        </div> : <div className="mg-compact-empty">No policy proposals are awaiting action.</div>}
      </section>
      <section className="mg-surface" aria-label="Active policies">
        <div className="mg-table-head"><div><h2>Active policies</h2>
          <p>Approved limits; adjustments in this console are deliberately stricter only.</p></div></div>
        {data.policies.length?<div className="mg-policy-grid">
          {data.policies.map(p=>{
            const hasPending=data.proposals.some(x=>x.organizationId===p.organizationId&&x.status==="PROPOSED");
            return <article key={p.id} className="mg-policy-card">
              <div className="mg-policy-card-top"><span className="mg-mini-state allow">ACTIVE</span>
                <span className="mg-policy-meta">{p.organizationName}</span></div>
              <h3>{p.name}</h3>
              <span className="mg-policy-amount">{money(p.limitCents)}</span>
              <p className="mg-policy-meta">Distinct imported PAID rows: {p.paidHistory.count}
                {p.paidHistory.count?" · Median "+money(p.paidHistory.medianCents):" · No history"}.
                Historical observations are not authorization.</p>
              {hasPending ? <p className="mg-horizon-warning">A proposal is awaiting review above.</p> :
                <details className="mg-policy-detail">
                  <summary>Prepare stricter limit</summary>
                  <PolicyPrepareForm organizationId={p.organizationId}
                    currentLimitCents={p.limitCents}
                    historyCount={p.paidHistory.count}
                    historyMedianCents={p.paidHistory.medianCents}/>
                </details>}
              <details className="mg-policy-detail mg-policy-revoke">
                <summary>Disable this policy</summary>
                <PolicyDisableForm policyId={p.id} expectedDigest={p.shutdownDigest}/>
              </details>
            </article>;
          })}
        </div> : <div className="mg-compact-empty">No active policies for your authorized organizations.</div>}
      </section>
      {data.disabledPolicies.length ? <section className="mg-surface" aria-label="Disabled policies">
        <div className="mg-table-head"><div><h2>Disabled policies</h2>
          <p>Preserved for historical review; these rules no longer grant authority.</p></div></div>
        <div className="mg-policy-grid">{data.disabledPolicies.map(p=><article key={p.id} className="mg-policy-card">
          <span className="mg-mini-state">DISABLED</span><h3>{p.name}</h3>
          <p>Previous cap: {money(p.limitCents)}</p><p className="mg-policy-meta">{p.organizationId}</p>
        </article>)}</div>
      </section> : null}
    </div>
  </main>;
}
