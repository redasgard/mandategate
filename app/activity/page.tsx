import { OperationsHeader } from "@/app/components/operations-header";
import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {listAdminActivity} from "@/src/history/activity";
export default async function ActivityPage(){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const entries=await listAdminActivity(session.user.id);
  return <main className="shell mg-shell">
    <OperationsHeader active="activity" title="Activity"
      description="Understand every consequential decision, its source, and its recorded outcome."
      email={session.user.email}/>
    <section className="panel detail">
      <p className="eyebrow">Operational history / authoritative records</p>
      <h2>Events and detection evidence</h2>
      <p className="muted">Recent decisions, admin reviews, AP imports, and PayPal execution events. Linked payment details preserve original reason codes and evidence. This operational activity table is not proof of external Merkle anchoring.</p>
      <div className="table-wrap">
        <table className="dashboard-table"><thead><tr>
          <th>Time (UTC)</th><th>Event / detector</th><th>Result</th>
          <th>Evidence / explanation</th><th>Actor</th>
        </tr></thead><tbody>
          {entries.map(e=><tr key={e.kind+e.eventId}>
            <td data-label="Time UTC">{e.occurredAt.toISOString()}</td>
            <td data-label="Event">{e.kind==="AP_IMPORT"
              ?<Link href="/ap-history">AP history import</Link>
              :<Link href={"/payments/"+encodeURIComponent(e.referenceId)}>
                {e.kind==="DECISION"?"Policy / behavior":e.kind==="PAYPAL_EVENT"?"PayPal execution":"Admin review"}
              </Link>}</td>
            <td data-label="Result"><strong>{e.summary}</strong></td>
            <td data-label="Evidence" style={{maxWidth:360,overflowWrap:"anywhere"}}>{e.details}</td>
            <td data-label="Actor" className="mono">{e.actorId??"System"}</td>
          </tr>)}
        </tbody></table>
        {entries.length===0?<p className="muted">No recorded activity yet.</p>:null}
      </div>
    </section>
  </main>;
}
