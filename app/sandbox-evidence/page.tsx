import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {HistoricalSandboxProof} from "@/app/demo/historical-sandbox-proof";

/**
 * Archived provider evidence only. This route is safe to view:
 * it does not read live financial records, create a request or contact PayPal.
 * It must never be presented as proof of invoice-derived payout.
 */
export default async function SandboxEvidencePage(){
 const session=await auth.api.getSession({headers:await headers()});
 if(!session)redirect("/sign-in");
 return <main className="shell">
  <Link className="back" href="/payments">← Payment records</Link>
  <section className="panel detail">
   <p className="eyebrow">Evidence archive / earlier Sandbox execution</p>
   <h1>PayPal Sandbox integration evidence</h1>
   <p className="muted">The recorded transaction below belongs to an earlier,
    separately authorized direct-agent payout. It did not originate from
    the fictional GLM-reviewed invoices in the current demonstration.</p>
   <HistoricalSandboxProof/>
   <p className="muted">This page performs no payment or provider verification.
    For current settlement, use an independently reconciled PayPal batch,
    item and signed webhook receipt.</p>
  </section>
 </main>;
}
