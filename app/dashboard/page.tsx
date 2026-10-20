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
          <p className="eyebrow">MANDATEGATE / OPERATIONS CONTROL</p>
          <h1>Payment operations</h1>
          <p className="muted">Autonomous accounts payable. Investigate exceptions, monitor execution, and manage standing authority.</p>
        </div>
        <div className="identity">{session.user.email}</div>
      </header>

      <nav className="panel" aria-label="Primary navigation" style={{display:"flex",gap:"1.2rem",flexWrap:"wrap",alignItems:"center"}}>
        <strong aria-current="page">Dashboard</strong>
        <Link href="/requests">Payments</Link>
        <Link href="/vendors">Vendors</Link>
        <Link href="/policies">Policies</Link>
        <Link href="/activity">Activity</Link>
      </nav>

      <section className="panel" aria-label="Operations workflow">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Agent-driven processing</p>
            <h2>Payments arrive from your operations agents</h2>
          </div>
          <span className="badge">Exception-first</span>
        </div>
        <div className="panel-body">
          <p>Agents submit invoice requests through the scoped API. MandateGate independently evaluates source evidence, vendor trust, historical behavior and active standing mandates. Authorized requests may execute automatically; exceptions require investigation.</p>
          <p className="muted">No invoice download and re-upload is required for the normal workflow. Manual document intake remains a support and testing tool, not the product's primary action.</p>
          <p><Link href="/requests">Review payments →</Link>{" · "}<Link href="/policies">Manage standing authority →</Link></p>
        </div>
      </section>

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
            <div><p className="eyebrow">Payment reporting</p><h2>Money position</h2></div>
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
            <div><p className="eyebrow">Recent activity</p><h2>Agent requests and policy outcomes</h2></div>
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
