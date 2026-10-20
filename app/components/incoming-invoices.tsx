import Link from "next/link";
import { invoiceIntakeLabel, type IncomingInvoice } from "@/src/db/operations-inbox";

export function IncomingInvoiceQueue({items}: {items: IncomingInvoice[]}) {
  return <section className="panel ops-queue-panel" aria-label="Received invoice documents">
    <div className="panel-head">
      <div><p className="eyebrow">Document intake / all authorized sources</p>
        <h2>Incoming invoices</h2></div>
      <span className="badge">{items.length} most recent shown</span>
    </div>
    {items.length ? <div className="table-wrap">
      <table className="dashboard-table ops-queue-table">
        <thead><tr><th>Received (UTC)</th><th>Organization</th><th>Source document</th><th>Analysis state</th><th>Evidence</th></tr></thead>
        <tbody>{items.map(item=><tr key={item.id}>
          <td data-label="Received UTC">{item.createdAt.toISOString().slice(0,16).replace("T"," ")}</td>
          <td data-label="Organization">{item.organization}</td>
          <td data-label="Document"><span className="mono">{item.id.slice(0,12)}</span> · {item.mimeType}</td>
          <td data-label="Analysis state"><span className="ops-state">{invoiceIntakeLabel(item.analysisStatus)}</span></td>
          <td data-label="Evidence"><Link href={"/invoice-artifacts/"+encodeURIComponent(item.id)}>Inspect source →</Link></td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="empty">No received invoice documents yet. Operations agents can send source PDFs or images directly to the scoped invoice-ingestion API.</div>}
    <p className="ops-context-note" style={{padding:"0 18px"}}>Includes both agent and admin uploads. Received or extracted documents are not authenticated suppliers or authorized payments. No invoice creation or payment occurs on this page.</p>
  </section>;
}
