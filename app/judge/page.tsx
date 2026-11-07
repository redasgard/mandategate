import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { demoPreviewEnabled, DEMO_CASES } from "@/src/demo/scenarios";
import {
  JudgeDemoError, readJudgeExecutionCount, readJudgeModelEvidence,
  readJudgeCanonicalDecisions,
} from "@/src/demo/judge-readonly";
import { JudgeScenarioReplay } from "./replay-cases";
import { JudgeSignOut } from "./sign-out";
import { HistoricalSandboxProof } from "../demo/historical-sandbox-proof";

export const dynamic = "force-dynamic";

/** Scoped test account: no ADMIN permission, no invoice upload or payout API. */
export default async function JudgePage() {
  if (!demoPreviewEnabled(process.env)) notFound();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?returnTo=%2Fjudge");

  let evidence: Awaited<ReturnType<typeof readJudgeModelEvidence>>;
  let canonical: Awaited<ReturnType<typeof readJudgeCanonicalDecisions>>;
  let executions: number;
  try {
    [evidence, canonical, executions] = await Promise.all([
      readJudgeModelEvidence(session.user.id),
      readJudgeCanonicalDecisions(session.user.id),
      readJudgeExecutionCount(session.user.id),
    ]);
  } catch (error) {
    if (error instanceof JudgeDemoError && error.httpStatus === 404) notFound();
    throw error;
  }
  const blocked = executions !== 0;
  return <main className="shell">
    <section className="panel detail">
      <p className="eyebrow">MandateGate / judge-only synthetic sandbox</p>
      <h1>Let agents propose. Keep authority over money.</h1>
      <p className="muted">
        This account has only a restricted REVIEWER membership in the fictional
        demo organization. The scenario buttons run the actual deterministic policy
        kernel without creating requests or transferring funds. AI observation and
        historical PayPal proof are separate evidence paths.
      </p>
      {blocked ? <p role="alert" className="error">
        Replay paused — this synthetic demo contains the recorded settlement:
        one reconciled PayPal Sandbox payout (shown in the demo video). Live
        policy replay is fail-closed after settlement by design; the saved
        evidence remains available below.
      </p> : <JudgeScenarioReplay cases={DEMO_CASES.map(item => ({
        id: item.id, title: item.title, expectedOutcome: item.expectedOutcome,
      }))}/>}

      <section className="review-stage" aria-label="Persisted canonical invoice requests">
        <p className="eyebrow">Database-backed P0 decision ledger</p>
        <h2>Saved outcomes, not just a simulation</h2>
        <p className="muted">
          These records come from tenant-bound payment_requests and payment_decisions
          rows. They were submitted as synthetic demo fixtures. They are not
          derived from GLM invoice observations, and none executed PayPal.
        </p>
        {blocked ? <p role="alert">Saved decisions are hidden while this
          demonstration organization contains payment activity (fail-closed
          policy).</p>
          : <div className="risk-evidence-list">
            {canonical.map(record => <article className="risk-evidence-card" key={record.id}>
              <h3>{record.invoiceNumber}</h3>
              {record.requestId
                ? <>
                  <p><strong>Persisted decision:</strong> {record.outcome} / {record.status}</p>
                  <p><strong>Recorded reasons:</strong> {record.reasonCodes.join(", ") || "None"}</p>
                  <p className="mono">Request {record.requestId}</p>
                  <p className="muted">Fictional canonical request. No PayPal execution.</p>
                </>
                : <p className="muted">No saved canonical fixture for this case.</p>}
            </article>)}
          </div>}
      </section>

      <section className="review-stage" aria-label="Previously saved fictional AI evidence">
        <p className="eyebrow">GLM-5.3 Flash / consented fictional input</p>
        <h2>Model observations, not authorization</h2>
        <p className="muted">
          These rows were already stored from byte-matched fictional documents
          with explicit retention consent. Viewing them makes no AI call.
          They are T1 advisory ESCALATE evidence, not independently verified
          invoice facts, supplier identity or payment authority. Strict
          account-level zero-data-retention compliance remains unverified.
        </p>
        {evidence.length === 0 ? <p>No eligible saved fictional observations.</p>
          : <div className="risk-evidence-list">
            {evidence.map(row => <article className="risk-evidence-card" key={row.artifactId}>
              <p className="eyebrow">Original source SHA {row.sourceShaPrefix}…</p>
              <h3>{row.invoiceNumber ?? "Invoice number unverified"}</h3>
              <p><strong>Unverified model suggestion:</strong>{" "}
                {row.vendor ?? "No vendor"} /{" "}
                {row.currency ?? ""} {row.amount ?? "No usable amount"}</p>
              <p><strong>Model:</strong> {row.model}</p>
              <p><strong>Advisory reason codes:</strong> {row.reasonCodes.join(", ")}</p>
              <p className="muted">Model text cannot approve, change a payee, or request a payout.</p>
            </article>)}
          </div>}
      </section>
      <HistoricalSandboxProof/>
      <JudgeSignOut />
      <p role="note" className="muted">
        This access is read-only and revocable. No ADMIN routes, original
        document downloads, model inference endpoints or payment execution
        endpoints are exposed through this judge experience.
      </p>
    </section>
  </main>;
}
