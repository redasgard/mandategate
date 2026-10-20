import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { listRecentDecisions } from "@/src/db/views";
import { readDashboardSummary } from "@/src/db/dashboard-overview";
import { readImportedObligations } from "@/src/db/imported-obligations";
import { ImportedObligations } from "./imported-obligations";
import { parseIncidentFilter, readDashboardIncidents } from "@/src/db/dashboard-incidents";
import { IncidentInvestigation } from "./incident-cards";
import { isRestrictedJudge } from "@/src/auth/judge-dashboard";
import { OperationsHeader } from "@/app/components/operations-header";
import { readIncomingInvoices } from "@/src/db/operations-inbox";
import { IncomingInvoiceQueue } from "@/app/components/incoming-invoices";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function exactCents(cents: string, currency: string) {
  const value = BigInt(cents);
  return currency + " " + (value / 100n).toLocaleString("en-US") + "." +
    (value % 100n).toString().padStart(2, "0");
}

function SnapshotMetric({label,value,detail}: {
  label:string; value:string; detail:string;
}) {
  return <article className="ops-summary-item">
    <span>{label}</span><strong>{value}</strong><small>{detail}</small>
  </article>;
}

export default async function DashboardPage({ searchParams }: {
  searchParams?: Promise<{ risk?: string | string[] }>;
} = {}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (await isRestrictedJudge(session.user.id)) redirect("/judge");

  const incidentFilter = parseIncidentFilter((await searchParams)?.risk);
  const [rows, summary, incidents, obligations, incoming] = await Promise.all([
    listRecentDecisions(session.user.id),
    readDashboardSummary(session.user.id),
    readDashboardIncidents(session.user.id, incidentFilter),
    readImportedObligations(session.user.id),
    readIncomingInvoices(session.user.id, 5),
  ]);

  const paidThisMonth = summary.paidThisMonth.length
    ? summary.paidThisMonth.map(p => exactCents(p.cents, p.currency)).join(" · ")
    : "None observed";
  const importNote = obligations.incomplete
    ? "Partial imported AP evidence; more than 200 open rows."
    : "From unverified imported AP rows, not scheduled payments.";

  return <main className="shell">
    <OperationsHeader active="dashboard" title="Payment operations"
      description="Monitor company money, investigate exceptions, and keep autonomous agents within approved payment authority."
      email={session.user.email} context="OVERVIEW"/>

    <section aria-label="Attention required" className="ops-alert-strip">
      <Link className="ops-alert" href="/dashboard?risk=REVIEW#incidents">
        <span className="ops-alert-copy"><strong>Awaiting review</strong><small>Escalated payment requests</small></span>
        <span className="ops-alert-count">{summary.pendingReview}</span>
      </Link>
      <Link className="ops-alert blocked" href="/dashboard?risk=BLOCKED#incidents">
        <span className="ops-alert-copy"><strong>Blocked payments</strong><small>Denied by policy or trust checks</small></span>
        <span className="ops-alert-count">{summary.denied}</span>
      </Link>
      <Link className="ops-alert" href="/dashboard?risk=PAYOUT#incidents">
        <span className="ops-alert-copy"><strong>Uncertain payouts</strong><small>Manual reconciliation required</small></span>
        <span className="ops-alert-count">{summary.payoutUnknown}</span>
      </Link>
    </section>

    <section aria-label="Financial position" className="ops-financial-section">
      <div className="ops-section-head"><h2>Money position</h2>
        <Link className="ops-subtle-link" href="/payments">All payments →</Link>
      </div>
      <div className="ops-summary-grid">
        <SnapshotMetric label="Available balance" value="Not connected"
          detail="No authenticated PayPal balance feed. Never assumed to be zero."/>
        <SnapshotMetric label="Recorded paid · UTC month" value={paidThisMonth}
          detail="Local PAID execution states; not a PayPal balance or net spend."/>
        <SnapshotMetric label="Upcoming · next 14 days"
          value={exactCents(obligations.upcoming.cents,"USD")}
          detail={obligations.upcoming.count+" imported open rows. Not authorized payouts."}/>
        <SnapshotMetric label="Overdue · imported AP"
          value={exactCents(obligations.overdue.cents,"USD")}
          detail={obligations.overdue.count+" imported open rows. Not verified liabilities."}/>
      </div>
      <p className="ops-context-note">{importNote} Due dates and amounts are historical observations; <Link href="/obligations">inspect provenance</Link>.</p>
    </section>

    <div className="dashboard-panels">
      <IncidentInvestigation incidents={incidents} activeFilter={incidentFilter}/>

      <section className="panel ops-queue-panel" aria-label="Payment requests awaiting review">
        <div className="panel-head">
          <div><p className="eyebrow">Exception queue</p><h2>Escalations awaiting a decision</h2></div>
          <span className="badge">{summary.pendingReview} open</span>
        </div>
        {summary.pendingInvoices.length ? <div className="table-wrap">
          <table className="dashboard-table ops-queue-table">
            <thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Why flagged</th></tr></thead>
            <tbody>{summary.pendingInvoices.map(item => <tr key={item.id}>
              <td data-label="Invoice"><Link href={"/payments/"+encodeURIComponent(item.id)}>{item.invoice}</Link></td>
              <td data-label="Vendor">{item.vendor}</td>
              <td data-label="Amount">{money(item.cents,item.currency)}</td>
              <td data-label="Why flagged">{item.reasons.join(", ") || "Review required"}</td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="empty">No open escalation requests.</div>}
        {summary.pendingReview>summary.pendingInvoices.length
          ? <p className="ops-context-note" style={{padding:"0 18px"}}>Showing the six most recent escalations. <Link href="/payments?view=REVIEW">Open the payment queue →</Link></p>
          : null}
      </section>

      <IncomingInvoiceQueue items={incoming}/>

      <section className="panel" aria-label="Recent payment decisions">
        <div className="panel-head">
          <div><p className="eyebrow">Agent requests</p><h2>Recent payment decisions</h2></div>
          <Link className="ops-muted-link" href="/payments">View payment requests →</Link>
        </div>
        {rows.length===0
          ? <div className="empty">No agent payment requests have been recorded for your organizations yet.</div>
          : <div className="table-wrap"><table className="dashboard-table ops-queue-table">
              <thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Decision</th><th>Current request state</th></tr></thead>
              <tbody>{rows.slice(0,8).map(row=><tr key={row.requestId}>
                <td data-label="Invoice"><Link href={"/payments/"+encodeURIComponent(row.requestId)}>{row.invoiceNumber}</Link></td>
                <td data-label="Vendor">{row.vendorName}</td>
                <td data-label="Amount">{money(row.amountCents,row.currency)}</td>
                <td data-label="Decision"><span className={"decision "+row.outcome.toLowerCase()}>{row.outcome}</span></td>
                <td data-label="Request state">{row.status}</td>
              </tr>)}</tbody>
            </table></div>}
      </section>

      <ImportedObligations overview={obligations} compact/>
    </div>

    <section className="ops-handoff" aria-label="Supporting tools" style={{marginTop:18}}>
      <div><h3>Source evidence and integration tools</h3>
        <p className="muted">Operations agents submit payment requests. Human document upload and AP import are supporting investigation tools, not the normal payment intake journey. Automatic payout dispatch requires verified trust and an active mandate; it is not yet end-to-end accepted.</p>
      </div>
      <div><Link href="/policies">Standing authority →</Link>{" · "}
        <Link href="/invoice-artifacts">Document evidence</Link>{" · "}
        <Link href="/ap-history">AP import</Link></div>
    </section>
  </main>;
}
