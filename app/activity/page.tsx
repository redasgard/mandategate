import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {listAdminActivity} from "@/src/history/activity";
export default async function ActivityPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const entries=await listAdminActivity(session.user.id);
  return <main className="shell">
    <Link className="back" href="/dashboard">← Dashboard</Link>
    <section className="panel detail">
      <p className="eyebrow">MandateGate / event provenance</p>
      <h1>Activity and consequential decisions</h1>
      <p className="muted">
        Recent decisions, human escalation actions, AP imports and PayPal
        execution events from organizations you currently administer. Original
        reason codes and evidence references remain in the linked payment view.
        This table is an operational activity view, not yet an externally
        anchored tamper-evident trail.
      </p>
      <div className="table-wrap">
        <table><thead><tr>
          <th>Time (UTC)</th><th>Event / detector</th><th>Result</th>
          <th>Evidence / explanation</th><th>Actor</th>
        </tr></thead><tbody>
          {entries.map(e=><tr key={e.kind+e.eventId}>
            <td>{e.occurredAt.toISOString()}</td>
            <td>{e.kind==="AP_IMPORT"
              ?<Link href="/ap-history">AP history import</Link>
              :<Link href={"/payments/"+encodeURIComponent(e.referenceId)}>
                {e.kind==="DECISION"?"Policy / behavior":e.kind==="PAYPAL_EVENT"?"PayPal execution":"Admin review"}
              </Link>}</td>
            <td><strong>{e.summary}</strong></td>
            <td style={{maxWidth:360,overflowWrap:"anywhere"}}>{e.details}</td>
            <td className="mono">{e.actorId??"System"}</td>
          </tr>)}
        </tbody></table>
        {entries.length===0?<p className="muted">No recorded activity yet.</p>:null}
      </div>
    </section>
  </main>;
}
