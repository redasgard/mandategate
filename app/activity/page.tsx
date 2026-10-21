import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/src/auth/auth";
import {OperationsHeader} from "@/app/components/operations-header";
import {listAdminActivity} from "@/src/history/activity";

function eventLabel(kind:string) {
  if(kind==="AP_IMPORT")return "AP data imported";
  if(kind==="DECISION")return "Policy decision";
  if(kind==="PAYPAL_EVENT")return "PayPal provider event";
  return "Administrator action";
}
export default async function ActivityPage() {
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const entries=await listAdminActivity(session.user.id);
  return <main className="shell mg-shell">
    <OperationsHeader active="activity" title="Activity" context="ACTIVITY"
      description="A chronological view of consequential decisions, human actions, and recorded provider events."
      email={session.user.email}/>
    <div className="mg-dashboard">
      <section className="mg-surface" aria-label="Operational activity timeline">
        <div className="mg-table-head">
          <div><h2>Events and detection evidence</h2>
            <p>Stored operational activity. Individual records retain the original source and explanation.</p></div>
          <span className="mg-mini-state">{entries.length} recent</span>
        </div>
        {entries.length ? <ol className="mg-activity-list">
          {entries.map(e=><li key={e.kind+e.eventId} className="mg-activity-entry">
            <span className="mg-activity-rail" aria-hidden="true"><span className="mg-activity-node"/></span>
            <div className="mg-activity-content">
              <div className="mg-activity-top"><span className="mg-mini-state">{eventLabel(e.kind)}</span>
                <time dateTime={e.occurredAt.toISOString()}>{e.occurredAt.toISOString().slice(0,16).replace("T"," ")} UTC</time></div>
              <h3>{e.summary}</h3>
              <p>{e.details}</p>
              <div className="mg-activity-meta"><span>Actor: {e.actorId??"System"}</span>
                {e.kind==="AP_IMPORT"
                  ? <Link href="/ap-history">Inspect AP source ↗</Link>
                  : <Link href={"/payments/"+encodeURIComponent(e.referenceId)}>Inspect payment evidence ↗</Link>}
              </div>
            </div>
          </li>)}
        </ol> : <div className="mg-compact-empty">
          No activity is recorded for your authorized organizations.
        </div>}
        <p className="mg-source-note">This is a read-side operational history, not proof of independent Merkle anchoring or immutable off-site recovery. A policy decision is not a PayPal settlement.</p>
      </section>
    </div>
  </main>;
}
