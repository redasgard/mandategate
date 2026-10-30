import Link from "next/link";
import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {demoPreviewEnabled,isolatedCiDemoEnabled} from "@/src/demo/scenarios";
import {HistoricalGlmProof} from "./historical-glm-proof";
import {listDemoScenarios,DemoScenarioError} from "@/src/demo/scenarios-store";
import {readDemoEvidence} from "@/src/demo/evidence";
import {DemoVisionEvidence} from "./vision-evidence";
import {HistoricalSandboxProof} from "./historical-sandbox-proof";
import {LoadDemoScenarios} from "./load-button";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
export const dynamic="force-dynamic";
export default async function DemoPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  if(!demoPreviewEnabled(process.env))notFound();
  let scenarios: Awaited<ReturnType<typeof listDemoScenarios>>;
  let evidence: Awaited<ReturnType<typeof readDemoEvidence>>;
  try {
    [scenarios,evidence] = await Promise.all([
      listDemoScenarios(session.user.id),
      readDemoEvidence(session.user.id),
    ]);
  } catch(e) {
    if(e instanceof DemoScenarioError && e.httpStatus===404)notFound();
    throw e;
  }
  const unsafeReplay=evidence.organizationExecutionRows>0 ||
    scenarios.some(item=>item.hasExecution ||
      (item.outcome!=null && item.outcome!==item.expectedOutcome));
  return <main className="shell">
    <Link className="back" href="/dashboard">← Dashboard</Link>
    <section className="panel detail">
      <p className="eyebrow">MandateGate / synthetic test lab</p>
      <h1>{unsafeReplay?"Replay halted: unexpected financial state":"Three decisions. Zero current demo executions."}</h1>
      {unsafeReplay?<p role="alert" className="error">A synthetic decision or payment execution record is inconsistent. Do not replay until investigated.</p>:null}
      <p className="muted">Use these fictional Northstar Components invoices to explain why an agent
        can request a payment but cannot authorize one. These deterministic decisions are a separate simulation:
        no external issuer authentication, customer invoice, or PayPal payout is represented.
        Above them, inspect saved model observations from fictional documents.</p>
      <nav className="review-stage" aria-label="Guided judge demonstration">
        <p className="eyebrow">Judge walkthrough / 90 seconds</p>
        <h2>Follow the trust boundary</h2>
        <ol>
          <li><a href="#demo-ai-observations">AI interprets fictional documents; it does not authorize payment.</a></li>
          <li><a href="#demo-decisions">Deterministic policy independently ALLOWS, ESCALATES or DENIES synthetic requests.</a></li>
          <li><a href="#demo-historical-paypal">Inspect the earlier PayPal Sandbox receipt, separate from the GLM invoices and this demo database.</a></li>
        </ol>
        <p className="muted">The historical direct PayPal Sandbox payout was a different workflow. Do not describe it as a payment caused by these PDFs.</p>
      </nav>
      <DemoVisionEvidence evidence={evidence}/>
      {isolatedCiDemoEnabled(process.env)?<HistoricalGlmProof/>:null}
      {unsafeReplay?null:<LoadDemoScenarios/>}
      <section className="review-stage" aria-label="Optional historical AP demonstration">
        <p className="eyebrow">Optional / historical anomaly detection</p>
        <h2>Exercise the imported-invoice baseline</h2>
        <p className="muted">The three decisions below are seeded deterministic
          examples, not decisions derived from an imported AP history file.
          The connected demo presently requires an explicitly loaded historical
          export to show source-backed paid-history anomaly evidence.</p>
        <p><Link href="/ap-history">Review AP history and import fictional Northstar CSV →</Link></p>
        <p className="muted">First load the three deterministic cases. Then, in
          AP history, import the fictional pack. Future requests can be assessed
          against that imported baseline. The CSV contains no real PayPal
          settlement records and never updates trusted payment receivers.</p>
      </section>
      <section id="demo-decisions" className="risk-evidence-list" aria-label="Synthetic demonstration scenarios">
        {scenarios.map((item,index)=><article key={item.id} className="risk-evidence-card">
          <p className="eyebrow">Scenario {index+1} / {item.id}</p>
          <h2>{item.title}</h2>
          <p>{item.explanation}</p>
          <p><strong>Fictional invoice:</strong> {item.invoiceNumber} / {money(item.amountCents)}</p>
          <p><strong>Expected deterministic outcome:</strong> {item.expectedOutcome}</p>
          <p><strong>Observed outcome:</strong> {item.outcome??"Not loaded"}
            {item.status?" / "+item.status:""}</p>
          {item.reasonCodes.length>0?<p><strong>Actual policy reason codes:</strong> <code>{item.reasonCodes.join(", ")}</code></p>:null}
          {item.outcome && item.outcome!==item.expectedOutcome?<p role="alert" className="error">Actual decision differs from expected deterministic case. Stop and inspect.</p>:null}
          {item.requestId?<p><Link href={"/payments/"+item.requestId}>Inspect original decision and evidence →</Link></p>:null}
          {item.hasExecution?<p role="alert" className="error">An execution record exists; stop the demo and investigate.</p>
            :item.requestId?<p className="muted">No payment execution record for this synthetic request.</p>:null}
        </article>)}
      </section>
      <HistoricalSandboxProof/>
    </section>
  </main>;
}
