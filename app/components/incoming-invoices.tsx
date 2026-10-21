import Link from "next/link";
import type { IncomingInvoice } from "@/src/db/operations-inbox";
import { invoiceIntakeLabel } from "@/src/ui/invoice-intake-status";

export function IncomingInvoiceQueue({items}:{items:IncomingInvoice[]}) {
  return <section className="mg-surface" aria-label="Received invoice documents">
    <div className="mg-table-head">
      <div><h2>Incoming invoices</h2><p>Observed documents · source and AI fields remain untrusted</p></div>
      <span className="mg-mini-state">{items.length} shown</span>
    </div>
    {items.length ? <div className="mg-document-list">
      {items.map(item=><Link className="mg-document-item" key={item.id}
        href={"/invoice-artifacts/"+encodeURIComponent(item.id)}
        aria-label={"Inspect invoice source in "+item.organization}>
        <span className="mg-document-icon" aria-hidden="true">DOC</span>
        <span className="mg-document-copy">
          <span className="mg-document-title">{item.suggestedVendor??"No AI suggestions"}{item.suggestedInvoice?" · "+item.suggestedInvoice:""}</span>
          <span className="mg-document-subtitle">
            {item.organization} · {item.suggestedCurrency&&item.suggestedAmount
              ?item.suggestedCurrency+" "+item.suggestedAmount
              :"No verified amount"} · {item.mimeType}
          </span>
        </span>
        <span className="mg-document-state">{invoiceIntakeLabel(item.analysisStatus)}</span>
      </Link>)}
    </div> : <div className="mg-compact-empty">
      No incoming documents yet. Scoped operations agents submit them directly; this console does not require manual invoice re-upload.
    </div>}
    <p className="mg-source-note">
      AI suggestions are advisory and cannot authenticate an issuer, change a trusted recipient, or authorize a payout.
      <Link href="/invoice-artifacts"> Inspect source evidence ↗</Link>
    </p>
  </section>;
}
