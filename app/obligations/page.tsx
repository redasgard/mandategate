import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {isRestrictedJudge} from "@/src/auth/judge-dashboard";
import {OperationsHeader} from "@/app/components/operations-header";
import {readImportedObligations} from "@/src/db/imported-obligations";
import {ImportedObligations} from "@/app/dashboard/imported-obligations";

export default async function ObligationsPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  if(await isRestrictedJudge(session.user.id))redirect("/judge");
  const items=await readImportedObligations(session.user.id);
  return <main className="shell mg-shell">
    <OperationsHeader active="obligations" title="AP horizon"
      context="AP HORIZON"
      description="Imported outstanding invoices, explicitly separate from payable mandates. Outstanding means observed in AP history, not a newly authorized payout."
      email={session.user.email}/>
    <ImportedObligations overview={items}/>
  </main>;
}
