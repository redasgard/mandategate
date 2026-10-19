import Link from "next/link";
import type { ObligationOverview } from "@/src/db/imported-obligations";

const money=(cents:string|number)=>{
  const value=BigInt(cents);
  return "USD "+(value/100n).toLocaleString("en-US")+"."+
    (value%100n).toString().padStart(2,"0");
};

export function ImportedObligations({overview,compact=false}:{
  overview:ObligationOverview;compact?:boolean;
}){
  const top=compact?overview.items.slice(0,5):overview.items;
  return <section className="panel" aria-label="Imported AP obligations">
    <div className="panel-head">
      <div><p className="eyebrow">Upcoming & overdue / imported AP evidence</p>
        <h2>Obligations to investigate</h2></div>
      <span className="badge">Imported records only · not scheduled</span>
    </div>
    <div className="panel-body">
      <p className="muted">These are the latest imported PENDING/APPROVED rows with due dates.
        They are <strong>unverified historical observations</strong>, not confirmed
        liabilities, approved payments or future PayPal instructions. Newer PAID
        imports suppress older open rows with the same vendor, invoice and invoice date.</p>
      <div className="obligation-metrics">
        <article><span>Overdue before {overview.asOfUtc}</span>
          <strong>{overview.overdue.count}</strong><p>{money(overview.overdue.cents)}</p></article>
        <article><span>Due through {overview.upcomingHorizon}</span>
          <strong>{overview.upcoming.count}</strong><p>{money(overview.upcoming.cents)}</p></article>
        <article><span>Later due dates</span>
          <strong>{overview.later.count}</strong><p>{money(overview.later.cents)}</p></article>
      </div>
      {overview.incomplete?<p role="status" className="error">Showing only the first 200
        imported open rows. Counts and amounts are partial, not portfolio totals.</p>:null}
      {top.length===0?<p className="muted">No imported open obligations with a valid due date.
        Import current AP evidence to populate this view.</p>:
        <div className="table-wrap"><table className="dashboard-table">
          <thead><tr><th>Due UTC</th><th>Vendor / invoice</th><th>Imported state</th><th>Amount</th><th>Provenance</th></tr></thead>
          <tbody>{top.map(x=><tr key={x.id}>
            <td data-label="Due UTC"><strong>{x.dueDate}</strong> · {x.category}</td>
            <td data-label="Vendor / invoice">{x.vendor} · {x.invoiceNumber}</td>
            <td data-label="Imported state">{x.status}</td>
            <td data-label="Amount">{money(x.amountCents)}</td>
            <td data-label="Provenance">Import <code>{x.importId.slice(0,8)}</code> ·
              SHA <code>{x.importSourceSha256.slice(0,12)}</code></td>
          </tr>)}</tbody>
        </table></div>}
      {compact?<p><Link href="/obligations">Investigate all imported obligations →</Link></p>:
        <p><Link href="/ap-history">Import updated AP evidence →</Link></p>}
      <p className="muted">No PayPal balance, payout schedule or execution state is inferred
        from imported due dates. UTC date boundaries apply to this preview.</p>
    </div>
  </section>;
}
