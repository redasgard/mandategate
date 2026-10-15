import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { listRecentDecisions } from "@/src/db/views";
import { readDashboardSummary } from "@/src/db/dashboard-overview";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function exactCents(cents: string, currency: string) {
  const value = BigInt(cents);
  return currency + " " + (value / 100n).toLocaleString("en-US") + "." +
    (value % 100n).toString().padStart(2, "0");
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const demoMode = process.env.MANDATEGATE_RUNTIME_MODE === "neon-preview" && process.env.MANDATEGATE_DISABLE_PAYMENTS === "1";
  const [rows, summary] = await Promise.all([
    listRecentDecisions(session.user.id), readDashboardSummary(session.user.id),
  ]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MandateGate / authority console</p>
          <h1>The firewall between AI agents and your money.</h1>
          <p className="muted">{demoMode ? <><Link href="/demo">Three-case demo lab</Link>{" · "}</> : null}<Link href="/invoice-artifacts">Review source invoices</Link>
            {" · "}<Link href="/ap-history">Import historical AP evidence</Link>
            {" · "}<Link href="/vendors">Vendor trust and re-verification</Link>
            {" · "}<Link href="/activity">Activity and decision evidence</Link></p>
        </div>
        <div className="identity">{session.user.email}</div>
      </header>

      {demoMode ? <section className="panel review-stage" aria-label="Demo preview status">
        <p className="eyebrow">Synthetic preview / PayPal execution disabled</p>
        <h2>See why an AI agent cannot authorize spending</h2>
        <p className="muted">Replay three fictional invoice decisions. No payout or real vendor authorization is part of this preview.</p>
        <p><Link href="/demo">Open the three-scenario demo →</Link></p>
      </section> : null}
      <section className="metrics" aria-label="Current payment risk">
        <article className="metric danger"><span>AWAITING REVIEW</span><strong>{summary.pendingReview}</strong></article>
        <article className="metric blocked"><span>DENIED REQUESTS</span><strong>{summary.denied}</strong></article>
        <article className="metric danger"><span>UNKNOWN PAYOUT OUTCOME</span><strong>{summary.payoutUnknown}</strong></article>
      </section>

      <div className="dashboard-panels">
        <section className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Payment reporting</p><h2>Observed state, not invented balances</h2></div>
            <span className="badge">Sandbox / live PostgreSQL</span>
          </div>
          <div className="panel-body">
            <p><strong>Available balance:</strong> Unavailable. Authenticated PayPal balance reporting is not connected.</p>
            <p><strong>Upcoming / overdue:</strong> Not tracked. No verified due-date or scheduling ledger yet.</p>
            <p><strong>Confirmed payouts submitted this UTC month:</strong>{" "}
              {summary.paidThisMonth.length
                ? summary.paidThisMonth.map(p => <span key={p.currency}>{exactCents(p.cents,p.currency)} ({p.count} paid){" "}</span>)
                : "None observed"}
            </p>
            <p className="muted">Gross paid payout records only, grouped by currency. Not net cash flow or account balance.</p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Action required</p><h2>Unresolved escalations</h2></div>
            <span className="badge">{summary.pendingReview} pending across your organizations</span>
          </div>
          {summary.pendingInvoices.length ? <div className="table-wrap">
            <table className="dashboard-table" aria-label="Escalations awaiting review"><thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Risk evidence</th></tr></thead>
              <tbody>{summary.pendingInvoices.map(p => <tr key={p.id}>
                <td data-label="Invoice"><Link href={"/payments/" + encodeURIComponent(p.id)}>{p.invoice}</Link></td>
                <td data-label="Vendor">{p.vendor}</td><td data-label="Amount">{money(p.cents,p.currency)}</td>
                <td data-label="Risk evidence">{p.reasons.join(", ")}</td>
              </tr>)}</tbody>
            </table>
          </div> : <div className="empty">No escalations currently awaiting review.</div>}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Recent authority decisions</p><h2>Agent requests, MandateGate decisions</h2></div>
            <span className="badge">Payment execution requires separate authorization</span>
          </div>
          {rows.length === 0 ? (
            <div className="empty"><p>No requests yet.</p><code>POST /api/agent/payment-requests</code></div>
          ) : (
            <div className="table-wrap">
              <table className="dashboard-table" aria-label="Recent authority decisions">
                <thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Decision</th><th>Reason</th></tr></thead>
                <tbody>{rows.map(row => <tr key={row.requestId}>
                  <td data-label="Invoice"><Link href={"/payments/" + encodeURIComponent(row.requestId)}>{row.invoiceNumber}</Link></td>
                  <td data-label="Vendor">{row.vendorName}</td>
                  <td data-label="Amount">{money(row.amountCents,row.currency)}</td>
                  <td data-label="Decision"><span className={"decision " + row.outcome.toLowerCase()}>{row.outcome}</span></td>
                  <td data-label="Reason">{row.reasonCodes.join(", ")}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
