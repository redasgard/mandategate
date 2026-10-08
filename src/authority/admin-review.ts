import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool";
import { inspectCurrentAuthorityBinding, AuthorityBindingRejected } from "./binding-guard";

export class ReviewRejected extends Error {
  constructor(public readonly code: string) { super(code); this.name = "ReviewRejected"; }
}
export type ReviewerAction = "APPROVE" | "REJECT";

export async function reviewInvoiceBinding(input: {
  bindingId: string;
  reviewerId: string;
  action: ReviewerAction;
  expectedTupleSha256: string;
  reason: string;
}) {
  if (!/^[a-f0-9]{64}$/.test(input.expectedTupleSha256) ||
      input.reason.trim().length < 12 || input.reason.length > 2000)
    throw new ReviewRejected("REVIEW_INPUT_INVALID");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const row = await client.query(
      "select organization_id, artifact_id, tuple_sha256, authorization_status from payment_authority_bindings where id=$1 for update",
      [input.bindingId],
    );
    const binding = row.rows[0];
    if (!binding) throw new ReviewRejected("REVIEW_BINDING_NOT_FOUND");
    const member = await client.query(
      "select 1 from organization_admin_memberships where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true for share",
      [binding.organization_id, input.reviewerId],
    );
    if (!member.rows[0]) throw new ReviewRejected("REVIEWER_NOT_AUTHORIZED");
    if (binding.tuple_sha256 !== input.expectedTupleSha256)
      throw new ReviewRejected("REVIEW_TUPLE_CHANGED");
    if (binding.authorization_status !== "PROPOSED")
      throw new ReviewRejected("REVIEW_ALREADY_RESOLVED");
    if (input.action === "APPROVE") {
      // The locked binding is checked against current independently verified
      // source, origin, policy, vendor and trusted receiver, not reviewer input.
      await inspectCurrentAuthorityBinding(client, input.bindingId, "PROPOSED");
    }
    const proof = createHash("sha256")
      .update(["mandategate/reviewer-attestation/v1",input.bindingId,binding.tuple_sha256,
        input.reviewerId,input.action,input.reason.trim()].join("\0"))
      .digest("hex");
    const status = input.action === "APPROVE" ? "AUTHORIZED" : "REVOKED";
    await client.query(
      "update payment_authority_bindings set authorization_status=$2,approval_actor=$3,approval_proof_sha256=$4,revoked_at=case when $2='REVOKED' then now() else null end where id=$1 and authorization_status='PROPOSED'",
      [input.bindingId,status,input.reviewerId,proof],
    );
    await client.query(
      ["insert into parameter_lineage_events",
       "(trace_id,sequence,organization_id,artifact_id,binding_id,source_kind,trust_tier,event_type,source_record_id,field_name,observed_value_sha256,sink_component,sink_field)",
       "values ($1,1,$2,$3,$4,'HUMAN',4,$5,$6,'payment_tuple',$7,'payment_authority_bindings','authorization_status')"].join(" "),
      [randomUUID(),binding.organization_id,binding.artifact_id,input.bindingId,
       input.action==="APPROVE"?"BOUND_REVIEW_APPROVED":"BOUND_REVIEW_REJECTED",input.reviewerId,proof],
    );
    await client.query("commit");
    return { bindingId:input.bindingId, action:input.action, status, tupleSha256:binding.tuple_sha256, paymentExecuted:false as const };
  } catch (error) {
    await client.query("rollback").catch(()=>undefined);
    if(error instanceof AuthorityBindingRejected) throw new ReviewRejected(error.code);
    throw error;
  } finally { client.release(); }
}
