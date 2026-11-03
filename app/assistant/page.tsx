import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {OperationsHeader} from "@/app/components/operations-header";
import {AssistantClient} from "./assistant-client";
export const dynamic="force-dynamic";
export default async function AssistantPage(){
 const session=await auth.api.getSession({headers:await headers()});
 if(!session)redirect("/sign-in");
 return <main className="shell mg-shell">
  <OperationsHeader active="assistant" title="Assistant" context="ASSISTANT" description="Persistent, account-scoped operational conversation. Informational only." email={session.user.email}/>
  <div className="mg-dashboard"><AssistantClient/></div>
 </main>;
}
