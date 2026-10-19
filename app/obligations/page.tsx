import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {isRestrictedJudge} from "@/src/auth/judge-dashboard";
import {readImportedObligations} from "@/src/db/imported-obligations";
import {ImportedObligations} from "@/app/dashboard/imported-obligations";

export default async function ObligationsPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  if(await isRestrictedJudge(session.user.id))redirect("/judge");
  const items=await readImportedObligations(session.user.id);
  return <main className="shell">
    <Link href="/dashboard" className="back">← Dashboard</Link>
    <div className="topbar"><div><p className="eyebrow">MandateGate / imported AP timeline</p>
      <h1>Time to act on outstanding invoices.</h1>
      <p className="muted">Latest imported evidence, explicitly separate from payable mandates.
        Outstanding means observed in AP history, not a newly authorized payout.</p>
    </div></div>
    <ImportedObligations overview={items}/>
  </main>;
}
