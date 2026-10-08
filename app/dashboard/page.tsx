import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { listRecentDecisions } from "@/src/db/views";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const rows = await listRecentDecisions();

  const counts = rows.reduce(
    (acc, row) => ({ ...acc, [row.outcome]: (acc[row.outcome] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MandateGate / authority console</p>
          <h1>The firewall between AI agents and your money.</h1>
          <p className="muted"><Link href="/invoice-artifacts">Review source invoices</Link></p>
        </div>
        <div className="identity">{session.user.email}</div>
      </header>

      <section className="metrics">
        <article className="metric"><span>ALLOW</span><strong>{counts.ALLOW ?? 0}</strong></article>
        <article className="metric danger"><span>ESCALATE</span><strong>{counts.ESCALATE ?? 0}</strong></article>
        <article className="metric blocked"><span>DENY</span><strong>{counts.DENY ?? 0}</strong></article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><p className="eyebrow">Recent authority decisions</p><h2>Agent requests, MandateGate decisions</h2></div>
          <span className="badge">Payment decisions require separate authorization</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty">
            <p>No requests yet.</p>
            <code>POST /api/agent/payment-requests</code>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Decision</th><th>Reason</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.requestId}>
                    <td><Link href={`/payments/${row.requestId}`}>{row.invoiceNumber}</Link></td>
                    <td>{row.vendorName}</td>
                    <td>{money(row.amountCents, row.currency)}</td>
                    <td><span className={`decision ${row.outcome.toLowerCase()}`}>{row.outcome}</span></td>
                    <td>{row.reasonCodes.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
