import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { isRestrictedJudge } from "@/src/auth/judge-dashboard";
import { OperationsHeader } from "@/app/components/operations-header";
import { listRecentDecisions } from "@/src/db/views";
import { readDashboardSummary } from "@/src/db/dashboard-overview";
import { readImportedObligations } from "@/src/db/imported-obligations";
import { readIncomingInvoices } from "@/src/db/operations-inbox";
import { parseIncidentFilter, readDashboardIncidents } from "@/src/db/dashboard-incidents";
import { IncidentInvestigation } from "./incident-cards";
import { paymentSourceLabel } from "@/src/ui/payments-view";
import { invoiceIntakeLabel } from "@/src/ui/invoice-intake-status";

function centsLabel(cents: string | number, currency = "USD") {
  const value = BigInt(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return (negative?"−":"")+currency+" "+(absolute/100n).toLocaleString("en-US")+"."+
    (absolute%100n).toString().padStart(2,"0");
}
function decisionClass(decision: string) {
  if (decision === "ALLOW") return "allow";
  if (decision === "ESCALATE") return "escalate";
  if (decision === "DENY") return "deny";
  return "";
}

export default async function DashboardPage({searchParams}:{
  searchParams?:Promise<{risk?:string|string[]}>;
}={}) {
  const session = await auth.api.getSession({headers:await headers()});
  if (!session) redirect("/sign-in");
  if (await isRestrictedJudge(session.user.id)) redirect("/judge");

  const filter = parseIncidentFilter((await searchParams)?.risk);
  const [decisions,summary,incidents,obligations,incoming] = await Promise.all([
    listRecentDecisions(session.user.id),
    readDashboardSummary(session.user.id),
    readDashboardIncidents(session.user.id,filter),
    readImportedObligations(session.user.id),
    readIncomingInvoices(session.user.id,5),
  ]);
  const paid = summary.paidThisMonth;
  const pendingApprovals = summary.pendingReview;

  return <main className="shell mg-shell">
    <OperationsHeader active="dashboard" title="Payment operations"
      context="OVERVIEW" email={session.user.email ?? "Administrator"}
      description="Your money. Your policies. Your agents working within the rules."/>

    <div className="mg-dashboard">
      <p className="mg-dashboard-topnote"><span className="mg-tiny-dot" aria-hidden="true"/>
        Current organization records · Balance feed not connected
      </p>

      <section className="mg-attention" aria-label="Attention required">
        <div className="mg-attention-heading">
          <div><p className="mg-eyebrow">01 / THE DECISION DESK</p>
            <h2>What needs your attention</h2>
            <p>Exceptions surface here. Routine authorized agent requests should not demand another approval.</p>
          </div>
          <Link className="mg-view-link" href="/payments?view=REVIEW">Payment queue ↗</Link>
        </div>
        <div className="mg-status-shortcuts">
          <Link className="mg-status-shortcut" href="/dashboard?risk=REVIEW#incidents">
            <span><span className="mg-status-name">Awaiting review</span>
              <span className="mg-status-hint">Unresolved escalations</span></span>
            <strong className="mg-status-count is-review" data-mg-count="review">{pendingApprovals}</strong>
          </Link>
          <Link className="mg-status-shortcut" href="/dashboard?risk=BLOCKED#incidents">
            <span><span className="mg-status-name">Blocked requests</span>
              <span className="mg-status-hint">Recorded policy denials</span></span>
            <strong className="mg-status-count is-deny" data-mg-count="denied">{summary.denied}</strong>
          </Link>
          <Link className="mg-status-shortcut" href="/dashboard?risk=PAYOUT#incidents">
            <span><span className="mg-status-name">Provider uncertainty</span>
              <span className="mg-status-hint">Payouts needing reconciliation</span></span>
            <strong className="mg-status-count is-unknown" data-mg-count="unknown">{summary.payoutUnknown}</strong>
          </Link>
        </div>
      </section>

      <section aria-label="Money position">
        <div className="mg-section-title">
          <div><p className="mg-section-kicker">02 / FINANCIAL POSITION</p><h2>Money position</h2></div>
          <Link href="/obligations">Explore AP horizon ↗</Link>
        </div>
        <div className="mg-stats">
          <article className="mg-stat">
            <div className="mg-stat-top"><span className="mg-stat-label">Available balance</span>
              <span className="mg-stat-not-connected">NOT CONNECTED</span></div>
            <div className="mg-stat-value is-unavailable">Unavailable</div>
            <p className="mg-stat-hint">No authenticated PayPal balance feed is connected.</p>
          </article>
          <article className="mg-stat">
            <div className="mg-stat-top"><span className="mg-stat-label">Paid this month</span>
              <span className="mg-stat-badge">RECORDED</span></div>
            {paid.length ? <div>{paid.map((row,i)=>
              <div key={row.currency} className={i===0?"mg-stat-value":"mg-stat-subvalue"}>{centsLabel(row.cents,row.currency)}</div>
            )}</div> : <div className="mg-stat-value">No records</div>}
            <p className="mg-stat-hint">Local PAID execution records; not account cash balance.</p>
          </article>
          <article className="mg-stat">
            <div className="mg-stat-top"><span className="mg-stat-label">Upcoming · 14 days</span>
              <span className="mg-stat-badge">IMPORTED AP</span></div>
            <div className="mg-stat-value">{centsLabel(obligations.upcoming.cents)}</div>
            <p className="mg-stat-hint">{obligations.upcoming.count} imported open entries; not scheduled PayPal payments.</p>
          </article>
          <article className="mg-stat">
            <div className="mg-stat-top"><span className="mg-stat-label">Overdue</span>
              <span className="mg-stat-badge">IMPORTED AP</span></div>
            <div className="mg-stat-value">{centsLabel(obligations.overdue.cents)}</div>
            <p className="mg-stat-hint">{obligations.overdue.count} unverified open entries. Not confirmed liabilities.</p>
          </article>
        </div>
        {obligations.incomplete ? <p className="mg-horizon-warning" role="status">
          Historical AP values are partial: only the first 200 imported open records are included.
        </p> : null}
      </section>

      <section className="mg-queue-surface" aria-label="Payment exceptions and evidence">
        <IncidentInvestigation incidents={incidents} activeFilter={filter}/>
      </section>

      <section aria-label="Activity and intake">
        <div className="mg-section-title"><div>
          <p className="mg-section-kicker">03 / OPERATIONS FEED</p>
          <h2>Recent operational activity</h2>
        </div><Link href="/activity">Full activity trail ↗</Link></div>
        <div className="mg-main-row">
          <div className="mg-main-column">
            <section className="mg-surface" aria-label="Recent payment decisions">
              <div className="mg-table-head"><div><h2>Recent payment decisions</h2>
                <p>Recorded policy outcomes, not provider settlement</p></div>
                <Link className="mg-view-link" href="/payments">View all ↗</Link></div>
              {decisions.length ? <div className="mg-feed-list">
                {decisions.slice(0,6).map(row=><Link className="mg-feed-row"
                  key={row.requestId} href={"/payments/"+encodeURIComponent(row.requestId)}>
                  <span><span className="mg-feed-primary">{row.vendorName} · {row.invoiceNumber}</span>
                    <span className="mg-feed-description">{paymentSourceLabel(row.source)}
                      {" · "}{row.status}{" · "}{row.createdAt.toISOString().slice(0,16).replace("T"," ")} UTC</span></span>
                  <span className="mg-feed-right"><span className="mg-feed-money">{centsLabel(row.amountCents,row.currency)}</span>
                    <span className={"mg-mini-state "+decisionClass(row.outcome)}>{row.outcome}</span></span>
                </Link>)}
              </div> : <div className="mg-compact-empty">
                No payment decision records yet. Operations agents submit requests through the scoped API.
              </div>}
            </section>

            <section className="mg-surface" aria-label="Incoming invoices">
              <div className="mg-table-head"><div><h2>Incoming invoices</h2>
                <p>Received documents and unverified AI observations</p></div>
                <Link className="mg-view-link" href="/payments">See inbox ↗</Link></div>
              {incoming.length ? <div className="mg-document-list">
                {incoming.map(item=><Link className="mg-document-item"
                  key={item.id} href={"/invoice-artifacts/"+encodeURIComponent(item.id)}>
                  <span className="mg-document-icon" aria-hidden="true">DOC</span>
                  <span className="mg-document-copy">
                    <span className="mg-document-title">{item.suggestedVendor??"Invoice document"}{item.suggestedInvoice?" · "+item.suggestedInvoice:""}</span>
                    <span className="mg-document-subtitle">{item.organization}
                      {item.suggestedAmount&&item.suggestedCurrency
                        ?" · AI suggests "+item.suggestedCurrency+" "+item.suggestedAmount
                        :" · No verified amount"}
                    </span>
                  </span>
                  <span className="mg-document-state">{invoiceIntakeLabel(item.analysisStatus)}</span>
                </Link>)}
              </div> : <div className="mg-compact-empty">No incoming documents in your authorized organizations.</div>}
              <p className="mg-source-note">AI extraction is advisory, never issuer verification or authorization. <Link href="/invoice-artifacts">Open evidence tools ↗</Link></p>
            </section>
          </div>

          <div className="mg-main-column">
            <section className="mg-surface" aria-label="Imported AP obligations">
              <div className="mg-table-head"><div><h2>Payment horizon</h2>
                <p>Historical AP imports · unverified, not scheduled</p></div>
                <Link className="mg-view-link" href="/obligations">Details ↗</Link></div>
              {obligations.items.length ? <div className="mg-horizon">
                {obligations.items.slice(0,5).map(item=><div key={item.id} className="mg-horizon-row">
                  <span className="mg-horizon-date">{item.dueDate.slice(5)}</span>
                  <span className="mg-horizon-vendor">{item.vendor}
                    <small>{item.invoiceNumber} · {item.category}</small></span>
                  <span className="mg-horizon-money">{centsLabel(item.amountCents)}</span>
                </div>)}
              </div> : <div className="mg-compact-empty">No imported open AP obligations with due dates.</div>}
              {obligations.incomplete ? <p className="mg-horizon-warning">Partial import, not portfolio totals.</p> : null}
              <p className="mg-source-note">These dates do not trigger payouts. <Link href="/ap-history">AP source history ↗</Link></p>
            </section>
            <section className="mg-surface" aria-label="Authority controls">
              <div className="mg-table-head"><div><h2>Authority controls</h2>
                <p>Policies control payments. AI cannot grant access.</p></div></div>
              <Link className="mg-feed-row" href="/policies">
                <span><span className="mg-feed-primary">Payment policies</span>
                  <span className="mg-feed-description">Approved limits and proposed changes</span></span>
                <span className="mg-case-arrow" aria-hidden="true">↗</span>
              </Link>
              <Link className="mg-feed-row" href="/autopay">
                <span><span className="mg-feed-primary">Standing mandates</span>
                  <span className="mg-feed-description">Time-bound authority for automated payments</span></span>
                <span className="mg-case-arrow" aria-hidden="true">↗</span>
              </Link>
              <Link className="mg-feed-row" href="/vendors">
                <span><span className="mg-feed-primary">Trusted vendors</span>
                  <span className="mg-feed-description">Destination trust and re-verification cases</span></span>
                <span className="mg-case-arrow" aria-hidden="true">↗</span>
              </Link>
            </section>
          </div>
        </div>
      </section>

      <footer className="mg-footnote">
        MandateGate separates payment requests, deterministic decisions, review authority, and PayPal settlement.
        Source evidence and imported AP records may be incomplete. All displayed records are scoped to active administrator memberships.
        The separate Northstar USD 1.01 Sandbox fixture is not the ordinary user workflow.
      </footer>
    </div>
  </main>;
}
