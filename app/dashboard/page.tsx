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

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function exactCents(cents: string, currency: string) {
  const value = BigInt(cents);
  return currency + " " + (value / 100n).toLocaleString("en-US") + "." +
    (value % 100n).toString().padStart(2, "0");
}

export default async function DashboardPage({ searchParams }: {
  searchParams?: Promise<{ risk?: string | string[] }>;
} = {}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (await isRestrictedJudge(session.user.id)) redirect("/judge");
  const sandboxPayouts = process.env.MANDATEGATE_RUNTIME_MODE === "neon-sandbox" &&
    process.env.MANDATEGATE_DISABLE_PAYMENTS === "0";
  const incidentFilter = parseIncidentFilter((await searchParams)?.risk);
  const [rows, summary, incidents, obligations] = await Promise.all([
    listRecentDecisions(session.user.id), readDashboardSummary(session.user.id),
    readDashboardIncidents(session.user.id, incidentFilter),
    readImportedObligations(session.user.id),
  ]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MandateGate / PayPal + AI</p>
          <h1>The firewall between AI agents and your money.</h1>
          <p className="muted"><Link href="/invoice-artifacts">Invoice intake</Link>
            {" · "}<Link href="/ap-history">Import historical AP evidence</Link>
            {" · "}<Link href="/obligations">Upcoming and overdue imports</Link>
            {" · "}<Link href="/vendors">Vendor trust and re-verification</Link>
            {" · "}<Link href="/policies">Policies and proposals</Link>
            {" · "}<Link href="/activity">Activity and decision evidence</Link></p>
        </div>
        <div className="identity">{session.user.email}</div>
      </header>

      <section className="panel review-stage" aria-label="Invoice intake">
        <p className="eyebrow">Invoice intake / source evidence</p>
        <h2>Analyze, approve and execute invoice payments</h2>
        <p className="muted">Start with the original PDF, PNG, or JPEG. Uploaded
          documents are untrusted; AI reads them, policy evaluates the risk,
          and a reviewer controls authorization. Approved payments are executed
          through PayPal Sandbox and tracked through provider receipts.</p>
        <p><Link href="/invoice-artifacts">Open invoice workflow →</Link></p>
      </section>


      {sandboxPayouts ? <section className="panel review-stage" aria-label="PayPal Sandbox execution">
        <p className="eyebrow">PayPal Sandbox / actual API</p>
        <h2>Pay approved invoices through PayPal Sandbox</h2>
        <p className="muted">Executes through the real PayPal Sandbox API after invoice verification and approval. Each payout is recorded with its batch, item, and webhook status. No live funds are moved.</p>
        <p><Link href="/sandbox-payout">Open PayPal execution →</Link></p>
      </section> : null}
      <section className="metrics" aria-label="Current payment risk">
        <article className="metric danger"><span>AWAITING REVIEW</span><strong>{summary.pendingReview}</strong></article>
        <article className="metric blocked"><span>DENIED REQUESTS</span><strong>{summary.denied}</strong></article>
        <article className="metric danger"><span>UNKNOWN PAYOUT OUTCOME</span><strong>{summary.payoutUnknown}</strong></article>
      </section>

      <div className="dashboard-panels">
        <ImportedObligations overview={obligations} compact />
        <IncidentInvestigation incidents={incidents} activeFilter={incidentFilter} />
        <section className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Payment reporting</p><h2>Observed state, not invented balances</h2></div>
            <span className="badge">Sandbox / live PostgreSQL</span>
          </div>
          <div className="panel-body">
            <p><strong>Available balance:</strong> Unavailable. Authenticated PayPal balance reporting is not connected.</p>
            <p><strong>Upcoming / overdue:</strong> Displayed above as imported AP evidence. Not a validated financial obligation or a scheduled payout.</p>
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
