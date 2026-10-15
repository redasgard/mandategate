import Link from "next/link";
import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {demoPreviewEnabled} from "@/src/demo/scenarios";
import {listDemoScenarios,DemoScenarioError} from "@/src/demo/scenarios-store";
import {LoadDemoScenarios} from "./load-button";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
export const dynamic="force-dynamic";
export default async function DemoPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  if(!demoPreviewEnabled(process.env))notFound();
  let scenarios;
  try{scenarios=await listDemoScenarios(session.user.id);}
  catch(e){if(e instanceof DemoScenarioError && e.httpStatus===404)notFound();throw e;}
  return <main className="shell">
    <Link className="back" href="/dashboard">← Dashboard</Link>
    <section className="panel detail">
      <p className="eyebrow">MandateGate / synthetic test lab</p>
      <h1>Three decisions. Zero payouts.</h1>
      <p className="muted">Use these fictional Northstar Components invoices to explain why an agent
        can request a payment but cannot authorize one. This is a simulation:
        no issuer authentication, customer invoice, or actual PayPal payout is represented here.</p>
      <LoadDemoScenarios/>
      <section className="risk-evidence-list" aria-label="Synthetic demonstration scenarios">
        {scenarios.map((item,index)=><article key={item.id} className="risk-evidence-card">
          <p className="eyebrow">Scenario {index+1} / {item.id}</p>
          <h2>{item.title}</h2>
          <p>{item.explanation}</p>
          <p><strong>Fictional invoice:</strong> {item.invoiceNumber} / {money(item.amountCents)}</p>
          <p><strong>Expected deterministic outcome:</strong> {item.expectedOutcome}</p>
          <p><strong>Observed outcome:</strong> {item.outcome??"Not loaded"}
            {item.status?" / "+item.status:""}</p>
          {item.requestId?<p><Link href={"/payments/"+item.requestId}>Inspect original decision and evidence →</Link></p>:null}
          {item.hasExecution?<p role="alert" className="error">An execution record exists; stop the demo and investigate.</p>
            :item.requestId?<p className="muted">No payment execution record for this synthetic request.</p>:null}
        </article>)}
      </section>
    </section>
  </main>;
}
