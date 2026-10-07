import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { getDecisionDetail } from "@/src/db/views";

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { id } = await params;
  const row = await getDecisionDetail(id);
  if (!row) notFound();

  return (
    <main className="shell narrow">
      <Link href="/dashboard" className="back">← Dashboard</Link>
      <section className="panel detail">
        <p className="eyebrow">Payment request</p>
        <div className="detail-title"><h1>{row.invoiceNumber}</h1><span className={`decision ${row.outcome.toLowerCase()}`}>{row.outcome}</span></div>
        <dl>
          <div><dt>Vendor</dt><dd>{row.vendorName}</dd></div>
          <div><dt>Amount</dt><dd>{new Intl.NumberFormat("en-US", { style: "currency", currency: row.currency }).format(row.amountCents / 100)}</dd></div>
          <div><dt>Requested destination</dt><dd>{row.requestedDestination}</dd></div>
          <div><dt>Logical payment ID</dt><dd className="mono">{row.logicalPaymentId}</dd></div>
          <div><dt>Payment executed</dt><dd>No</dd></div>
        </dl>
        <h2>Reason codes</h2>
        <div className="chips">{row.reasonCodes.map((reason) => <span key={reason}>{reason}</span>)}</div>
        <h2>Evidence</h2>
        <pre>{JSON.stringify(row.evidence, null, 2)}</pre>
      </section>
    </main>
  );
}
