import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { isRestrictedJudge } from "@/src/auth/judge-dashboard";
import { OperationsHeader } from "@/app/components/operations-header";
import { listRecentDecisions } from "@/src/db/views";
import { readImportedObligations } from "@/src/db/imported-obligations";
import { readIncomingInvoices } from "@/src/db/operations-inbox";
import { IncomingInvoiceQueue } from "@/app/components/incoming-invoices";
import { PAYMENT_VIEW_OPTIONS, parsePaymentView, matchesPaymentView, paymentExecutionLabel, paymentSourceLabel } from "@/src/ui/payments-view";

function money(cents:number,currency:string){
  return new Intl.NumberFormat("en-US",{style:"currency",currency}).format(cents/100);
}
export default async function PaymentsPage({searchParams}:{
  searchParams?:Promise<{view?:string|string[]}>;
}={}) {
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  if(await isRestrictedJudge(session.user.id))redirect("/judge");
  const [rows,obligations,incoming]=await Promise.all([
    listRecentDecisions(session.user.id,100),
    readImportedObligations(session.user.id),
    readIncomingInvoices(session.user.id,12),
  ]);
  const view=parsePaymentView((await searchParams)?.view);
  const visible=rows.filter(row=>matchesPaymentView(row,view));
  const awaiting=rows.filter(row=>row.status==="ESCALATED").length;
  const uncertain=rows.filter(row=>row.executionStatus?.includes("UNKNOWN")).length;

  return <main className="shell mg-shell">
    <OperationsHeader active="payments" title="Payments"
      description="Follow incoming requests from agents to policy decisions, human review, and recorded PayPal outcomes."
      context="PAYMENTS" email={session.user.email}/>
    <div className="mg-dashboard">
      <div className="mg-status-shortcuts mg-ledger-overview" aria-label="Recent payment request summary">
        <Link className="mg-status-shortcut" href="/payments?view=ALL"><span>
          <span className="mg-status-name">Decision records</span>
          <span className="mg-status-hint">Latest 100 at most</span></span>
          <strong className="mg-status-count">{rows.length}</strong>
        </Link>
        <Link className="mg-status-shortcut" href="/payments?view=REVIEW"><span>
          <span className="mg-status-name">Needs review</span>
          <span className="mg-status-hint">Escalated and awaiting a decision</span></span>
          <strong className="mg-status-count is-review">{awaiting}</strong>
        </Link>
        <Link className="mg-status-shortcut" href="/payments?view=UNKNOWN"><span>
          <span className="mg-status-name">Provider uncertainty</span>
          <span className="mg-status-hint">Never retry without reconciliation</span></span>
          <strong className="mg-status-count is-unknown">{uncertain}</strong>
        </Link>
      </div>

      <section className="mg-surface" aria-label="Payment decision ledger">
        <div className="mg-table-head"><div><h2>Payment decision ledger</h2>
          <p>AI may observe invoices; MandateGate alone evaluates authority.</p></div>
          <span className="mg-mini-state">{visible.length} shown</span>
        </div>
        <nav className="mg-filter mg-payment-filters" aria-label="Payment decision filters">
          {PAYMENT_VIEW_OPTIONS.map(option=><Link key={option.value}
            href={option.value==="ALL"?"/payments":"/payments?view="+option.value}
            aria-current={view===option.value?"page":undefined}>
            {option.label}
          </Link>)}
        </nav>
        {visible.length ? <div className="table-wrap">
          <table className="dashboard-table mg-ledger-table">
            <thead><tr><th>Vendor / invoice</th><th>Origin</th><th>Amount</th>
              <th>Decision</th><th>Request</th><th>PayPal outcome</th><th>Recorded UTC</th></tr></thead>
            <tbody>{visible.map(row=><tr key={row.requestId}>
              <td data-label="Vendor / invoice"><Link href={"/payments/"+encodeURIComponent(row.requestId)}>
                <strong>{row.vendorName}</strong><span className="mg-ledger-invoice">{row.invoiceNumber} ↗</span>
              </Link></td>
              <td data-label="Origin">{paymentSourceLabel(row.source)}</td>
              <td data-label="Amount" className="mg-money-cell">{money(row.amountCents,row.currency)}</td>
              <td data-label="Decision"><span className={"mg-mini-state "+row.outcome.toLowerCase()}>{row.outcome}</span></td>
              <td data-label="Request">{row.status}</td>
              <td data-label="PayPal outcome">{paymentExecutionLabel(row.executionStatus)}</td>
              <td data-label="Recorded UTC">{row.createdAt.toISOString().slice(0,16).replace("T"," ")}</td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="mg-compact-empty">
          {rows.length?"No records match that filter.":"No payment decisions yet. Connected agents use the scoped payment API."}
        </div>}
        <p className="mg-source-note">This view shows the latest 100 decisions, not an exhaustive historical payment ledger. ALLOW is a policy result, not a PayPal receipt.</p>
      </section>

      <IncomingInvoiceQueue items={incoming}/>

      <section className="mg-surface" aria-label="Imported AP payment horizon">
        <div className="mg-table-head"><div><h2>Imported AP horizon</h2>
          <p>Unverified, historical payables · no automatic payment scheduling implied</p></div>
          <Link className="mg-view-link" href="/obligations">Inspect all ↗</Link>
        </div>
        <div className="mg-horizon">
          {obligations.items.slice(0,5).map(item=><div className="mg-horizon-row" key={item.id}>
            <span className="mg-horizon-date">{item.dueDate.slice(5)}</span>
            <span className="mg-horizon-vendor">{item.vendor}
              <small>{item.invoiceNumber} · {item.category}</small></span>
            <span className="mg-horizon-money">{money(item.amountCents,item.currency)}</span>
          </div>)}
          {obligations.items.length===0?<div className="mg-compact-empty">No imported open obligations with valid due dates.</div>:null}
        </div>
        {obligations.incomplete?<p className="mg-horizon-warning">Partial sample: only the first 200 open imported records were counted.</p>:null}
        <p className="mg-source-note">Uploaded source documents and imported AP statements are supporting evidence, never independent permission to pay. <Link href="/ap-history">Review imported source ↗</Link></p>
      </section>
    </div>
  </main>;
}
