import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { listRecentDecisions } from "@/src/db/views";
import { readImportedObligations } from "@/src/db/imported-obligations";
import { ImportedObligations } from "@/app/dashboard/imported-obligations";
import { isRestrictedJudge } from "@/src/auth/judge-dashboard";
import { OperationsHeader } from "@/app/components/operations-header";
import { PAYMENT_VIEW_OPTIONS, parsePaymentView, matchesPaymentView, paymentExecutionLabel } from "@/src/ui/payments-view";

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default async function PaymentsPage({searchParams}:{
  searchParams?:Promise<{view?:string|string[]}>;
}={}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (await isRestrictedJudge(session.user.id)) redirect("/judge");
  const [rows, obligations] = await Promise.all([
    listRecentDecisions(session.user.id,100),
    readImportedObligations(session.user.id),
  ]);
  const view = parsePaymentView((await searchParams)?.view);
  const visible = rows.filter(row => matchesPaymentView(row, view));
  const needsReview = rows.filter(row=>row.status==="ESCALATED").length;
  const denied = rows.filter(row=>row.outcome==="DENY").length;
  const allowed = rows.filter(row=>row.outcome==="ALLOW").length;

  return <main className="shell">
    <OperationsHeader active="payments" title="Payments"
      description="Follow agent-submitted invoices and payment decisions. Investigate exceptions rather than re-uploading documents."
      email={session.user.email}/>
    <section className="ops-summary-grid" aria-label="Recent request decisions">
      <article className="ops-summary-item"><span>Recent requests</span><strong>{rows.length}</strong><small>Latest 100 decision records at most</small></article>
      <article className="ops-summary-item"><span>Needs review</span><strong>{needsReview}</strong><small>Current escalated request state</small></article>
      <article className="ops-summary-item"><span>Denied</span><strong>{denied}</strong><small>Policy or trust boundary denied</small></article>
      <article className="ops-summary-item"><span>Allowed</span><strong>{allowed}</strong><small>Policy result; not proof of a payout</small></article>
    </section>
    <section className="panel ops-queue-panel">
      <div className="panel-head">
        <div><p className="eyebrow">Decision ledger</p><h2>Agent payment requests</h2></div>
        <span className="badge">{visible.length} shown / latest 100 maximum</span>
      </div>
      <nav aria-label="Payment decision filters" className="ops-table-toolbar">
        {PAYMENT_VIEW_OPTIONS.map(filter=><Link key={filter.value}
          href={filter.value==="ALL"?"/payments":"/payments?view="+filter.value}
          aria-current={view===filter.value?"page":undefined}>{filter.label}</Link>)}
      </nav>
      {visible.length ? <div className="table-wrap">
        <table className="dashboard-table ops-queue-table" aria-label="Agent payment requests">
          <thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Decision</th><th>Request state</th><th>PayPal result</th><th>Recorded (UTC)</th></tr></thead>
          <tbody>{visible.map(row=><tr key={row.requestId}>
            <td data-label="Invoice"><Link href={"/payments/"+encodeURIComponent(row.requestId)}>{row.invoiceNumber}</Link></td>
            <td data-label="Vendor">{row.vendorName}</td>
            <td data-label="Amount">{formatMoney(row.amountCents,row.currency)}</td>
            <td data-label="Decision"><span className={"decision "+row.outcome.toLowerCase()}>{row.outcome}</span></td>
            <td data-label="Request state"><span className="ops-state">{row.status}</span></td>
            <td data-label="PayPal result"><span className={"ops-state"+(row.executionStatus==="PAID"?" is-paid":row.executionStatus?.startsWith("PAYMENT_UNKNOWN")?" is-unknown":"")}>{paymentExecutionLabel(row.executionStatus)}</span></td>
            <td data-label="Recorded (UTC)">{row.createdAt.toISOString().slice(0,16).replace("T"," ")}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="empty">{rows.length
        ? "No recent payment requests match this filter."
        : "No agent payment requests recorded yet. Connected operations agents submit them through the scoped API."}</div>}
      <p className="ops-context-note" style={{padding:"0 18px"}}>ALLOW is a policy decision, not a PayPal receipt. Open a payment for the exact authorization, execution state and provider evidence. Filters apply to the most recent 100 decisions only.</p>
    </section>
    <ImportedObligations overview={obligations} compact/>
    <section className="ops-handoff" aria-label="Supporting payment tools" style={{marginTop:18}}>
      <div><h3>Agent-connected intake</h3><p className="muted">The default path starts in your operations agent. Manual document upload and AP import are available for exceptional evidence review; they do not themselves authorize or initiate payments.</p></div>
      <div><Link href="/policies">View policies →</Link>{" · "}
        <Link href="/invoice-artifacts">Invoice evidence</Link></div>
    </section>
  </main>;
}
