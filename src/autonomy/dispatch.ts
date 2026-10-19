import { pool } from "../db/pool";
import { postgresExecutionStore } from "../payments/executor/postgres-store";
import { inspectAutopayBinding } from "./budget";

export type AutonomousCandidate = {
  requestId: string;
  logicalPaymentId: string;
  organizationId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  authorization: "STANDING_MANDATE" | "EXACT_HUMAN_APPROVAL";
};

export type AutonomousPreviewResult = AutonomousCandidate & {
  preview: "WOULD_DISPATCH" | "HOLD";
  reason: "CURRENT_AUTHORITY" | "REVALIDATION_UNAVAILABLE_OR_STALE";
};

/**
 * Selects only canonical already-authorized payments.
 * ALLOW from agent_api additionally requires an explicit, currently active
 * per-vendor standing mandate. An approved escalation / previously confirmed
 * verified invoice has its own recorded one-time authority.
 *
 * No GLM observations, raw PDF text, demo_fixture or sandbox_fixture are
 * eligible. This function is READ-ONLY: the payment executor is not invoked.
 */
export async function listAutonomousCandidates(
  now: Date = new Date(), limit = 20,
): Promise<AutonomousCandidate[]> {
  if (!Number.isFinite(now.valueOf())) throw Error("AUTONOMY_CLOCK_INVALID");
  const count = Math.min(50, Math.max(1, Math.trunc(limit) || 20));
  const result = await pool.query([
    "select pr.id,pr.logical_payment_id,pr.organization_id,",
    "pr.invoice_number,pr.amount_cents,pr.currency,pr.source,pr.status,",
    "case when pr.status='APPROVED' or pr.source='verified_invoice'",
    "then 'EXACT_HUMAN_APPROVAL' else 'STANDING_MANDATE' end as authorization",
    "from payment_requests pr",
    "join payment_decisions pd on pd.payment_request_id=pr.id",
    "join vendors v on v.id=pr.vendor_id and v.organization_id=pr.organization_id",
    "join policies p on p.organization_id=pr.organization_id and p.active=true",
    "join lateral (select id,destination from vendor_destinations",
    "where vendor_id=pr.vendor_id and trusted=true",
    "order by created_at desc,id desc limit 1) vd on true",
    "where pr.currency='USD' and pr.amount_cents>0",
    "and pr.amount_cents <= p.auto_pay_max_amount_cents",
    "and pr.amount_cents <= v.normal_max_amount_cents",
    "and pr.requested_destination=vd.destination",
    "and not exists (select 1 from payment_executions x",
    "where x.logical_payment_id=pr.logical_payment_id)",
    "and (",
    "(pr.source='agent_api' and pr.status='ALLOWED' and pd.outcome='ALLOW'",
    "and exists (select 1 from autopay_mandates g",
    "join organization_admin_memberships m",
    "on m.organization_id=g.organization_id",
    "and m.user_id=g.approved_by_user_id and m.role='ADMIN' and m.active=true",
    "where g.organization_id=pr.organization_id and g.vendor_id=pr.vendor_id",
    "and g.destination_id=vd.id and g.policy_id=p.id",
    "and exists (select 1 from autopay_payment_bindings b",
    "where b.payment_request_id=pr.id and b.organization_id=pr.organization_id",
    "and b.mandate_id=g.id and b.destination_id=vd.id and b.policy_id=p.id",
    "and b.grant_digest=g.approval_digest and b.amount_cents=pr.amount_cents)",
    "and g.max_total_amount_cents>=pr.amount_cents and g.max_payment_count>0",
    "and g.source='agent_api' and g.active=true and g.revoked_at is null",
    "and exists(select 1 from autopay_mandate_events ev",
    "where ev.mandate_id=g.id and ev.organization_id=g.organization_id",
    "and ev.event_type='GRANTED' and ev.mandate_digest=g.approval_digest",
    "and ev.actor_user_id=g.approved_by_user_id",
    "and ev.created_at < pr.created_at)",
    "and not exists(select 1 from policy_shutdown_events sh",
    "where sh.policy_id=p.id and sh.organization_id=p.organization_id)",
    "and not exists(select 1 from vendor_reverification_cases vc",
    "left join vendor_reverification_resolutions vr on vr.case_id=vc.id",
    "where vc.organization_id=pr.organization_id and vc.vendor_id=pr.vendor_id",
    "and (vr.id is null or vr.resolution='SIMULATED_REVERIFIED'))",
    "and g.max_amount_cents>=pr.amount_cents and g.expires_at>$1))",
    "or (pr.source='verified_invoice' and pr.authority_binding_id is not null",
    "and pr.status='ALLOWED' and pd.outcome='ALLOW')",
    "or (pr.source in ('agent_api','verified_invoice') and pr.status='APPROVED'",
    "and pd.outcome='ESCALATE'",
    "and exists (select 1 from payment_escalation_reviews r",
    "join organization_admin_memberships m on",
    "m.user_id=r.reviewer_user_id and m.organization_id=pr.organization_id",
    "and m.role='ADMIN' and m.active=true",
    "where r.payment_request_id=pr.id and r.action='ACCEPT')))",
    "order by pr.created_at asc,pr.id asc limit $2",
  ].join(" "), [now,count]);
  return result.rows.map(r=>({
    requestId:String(r.id),
    logicalPaymentId:String(r.logical_payment_id),
    organizationId:String(r.organization_id),
    invoiceNumber:String(r.invoice_number),
    amountCents:Number(r.amount_cents),
    currency:String(r.currency),
    authorization:r.authorization==="STANDING_MANDATE"
      ?"STANDING_MANDATE" as const:"EXACT_HUMAN_APPROVAL" as const,
  }));
}

/**
 * Mandatory last-read preflight for a future cron dispatcher.
 * It deliberately does not claim, schedule or POST to PayPal.
 * The final *actual* dispatcher must revalidate the mandate after claiming
 * and before crossing the PayPal boundary.
 */
export async function previewAutonomousDispatch(
  now: Date = new Date(), limit = 20,
): Promise<AutonomousPreviewResult[]> {
  const candidates = await listAutonomousCandidates(now,limit);
  const results: AutonomousPreviewResult[] = [];
  for(const candidate of candidates) {
    try {
      const current = await postgresExecutionStore.getAuthoritativePayment(candidate.requestId);
      const budget=candidate.authorization==="STANDING_MANDATE"
        ?await inspectAutopayBinding(candidate.requestId):null;
      const budgetOk=candidate.authorization!=="STANDING_MANDATE"||
        (budget!==null&&(budget.existingReservation||
          (budget.remainingPayments>0&&BigInt(budget.remainingCents)>=BigInt(candidate.amountCents))));
      const valid=Boolean(budgetOk && current &&
        current.requestId===candidate.requestId &&
        current.logicalPaymentId===candidate.logicalPaymentId &&
        current.amountCents===candidate.amountCents &&
        current.currency===candidate.currency &&
        (current.decisionOutcome==="ALLOW"||current.decisionOutcome==="APPROVED"));
      results.push({...candidate,preview:valid?"WOULD_DISPATCH":"HOLD",
        reason:valid?"CURRENT_AUTHORITY":"REVALIDATION_UNAVAILABLE_OR_STALE"});
    } catch {
      results.push({...candidate,preview:"HOLD",
        reason:"REVALIDATION_UNAVAILABLE_OR_STALE"});
    }
  }
  return results;
}
