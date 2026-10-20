import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { listRecentDecisions } from "@/src/db/views";

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default async function PaymentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const rows = await listRecentDecisions(session.user.id);
  return <main className="shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">MANDATEGATE / PAYMENTS</p>
        <h1>Payment requests</h1>
        <p className="muted">Requests submitted by operations agents, with decisions made by MandateGate.</p>
      </div>
      <div className="identity">{session.user.email}</div>
    </header>
    <nav className="panel" aria-label="Primary navigation" style={{display:"flex",gap:"1.2rem",flexWrap:"wrap"}}>
      <Link href="/dashboard">Dashboard</Link><strong aria-current="page">Payments</strong>
      <Link href="/vendors">Vendors</Link><Link href="/policies">Policies</Link><Link href="/activity">Activity</Link>
    </nav>
    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">Incoming agent requests</p><h2>Recent decisions</h2></div><span className="badge">{rows.length} recent</span></div>
      {rows.length ? <div className="table-wrap">
        <table className="dashboard-table" aria-label="Payment requests">
          <thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Decision</th><th>Evidence</th></tr></thead>
          <tbody>{rows.map(row=><tr key={row.requestId}>
            <td data-label="Invoice"><Link href={"/payments/"+encodeURIComponent(row.requestId)}>{row.invoiceNumber}</Link></td>
            <td data-label="Vendor">{row.vendorName}</td><td data-label="Amount">{formatMoney(row.amountCents,row.currency)}</td>
            <td data-label="Decision"><span className={"decision "+row.outcome.toLowerCase()}>{row.outcome}</span></td>
            <td data-label="Evidence">{row.reasonCodes.join(", ")}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="empty"><p>No agent payment requests yet.</p><p className="muted">Your connected operations agent submits requests through the scoped payment API. Manual invoice upload is available for troubleshooting, not required for normal processing.</p></div>}
    </section>
    <section className="panel"><p className="muted">For source investigation or an exceptional manual workflow: <Link href="/invoice-artifacts">Invoice evidence</Link>. For payment authority: <Link href="/policies">Standing mandates and policies</Link>.</p></section>
  </main>;
}
