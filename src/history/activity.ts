import {pool} from "../db/pool";

export type ActivityRow={
  kind:string;eventId:string;organizationId:string;occurredAt:Date;
  referenceId:string;summary:string;details:string;actorId:string|null;
};

/** All event families are read-only projections of immutable/historical
 * evidence or durable financial state, scoped within one active ADMIN SQL query. */
export async function listAdminActivity(actorId:string,limit=100):Promise<ActivityRow[]>{
  const result=await pool.query([
    "select e.kind,e.event_id,e.organization_id,e.occurred_at,e.reference_id,",
    "e.summary,e.details,e.actor_id",
    "from (",
    "select 'DECISION'::text as kind,d.id as event_id,pr.organization_id,",
    "d.decided_at as occurred_at,pr.id as reference_id,d.outcome as summary,",
    "d.reason_codes::text as details,null::text as actor_id",
    "from payment_decisions d join payment_requests pr on pr.id=d.payment_request_id",
    "union all",
    "select 'ESCALATION_REVIEW',r.id::text,r.organization_id,r.created_at,",
    "r.payment_request_id,r.action,r.explanation,r.reviewer_user_id",
    "from payment_escalation_reviews r",
    "union all",
    "select 'AP_IMPORT',i.id::text,i.organization_id,i.created_at,",
    "i.id::text,'CSV_IMPORTED',",
    "('accepted='||i.accepted_row_count||' quarantined='||i.quarantine_count||",
    "' duplicates='||i.duplicate_count),i.imported_by_user_id",
    "from ap_imports i",
    "union all",
    "select 'PAYPAL_EVENT',ee.id,pr.organization_id,ee.created_at,pr.id,",
    "ee.event_type,ee.payload::text,null::text",
    "from payment_execution_events ee",
    "join payment_requests pr on pr.logical_payment_id=ee.logical_payment_id",
    ") e",
    "join organization_admin_memberships m on m.organization_id=e.organization_id",
    "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
    "order by e.occurred_at desc,e.event_id desc limit $2",
  ].join(" "),[actorId,Math.max(1,Math.min(200,limit))]);
  return result.rows.map(r=>({
    kind:r.kind,eventId:r.event_id,organizationId:r.organization_id,
    occurredAt:r.occurred_at,referenceId:r.reference_id,
    summary:r.summary,details:r.details,actorId:r.actor_id,
  }));
}
