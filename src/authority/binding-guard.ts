import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { invoiceDecimalToCents } from "../invoices/normalize";
import { PDF_SOURCE_PARSER_VERSION } from "../invoices/pdf-text";
import { hashPaymentAuthorityTuple } from "./contracts";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const criticalFields = [
  "vendor_name", "invoice_number", "currency",
  "total_amount_decimal", "invoice_payment_destination",
] as const;

export class AuthorityBindingRejected extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AuthorityBindingRejected";
  }
}
function refuse(code: string): never { throw new AuthorityBindingRejected(code); }

/**
 * Rechecks *current* trusted vendor, channel, policy, verifier, approver,
 * source and fixed parameter tuple on every authorization/execute boundary.
 * Call within an existing database transaction. No model output is accepted.
 */
export async function inspectCurrentAuthorityBinding(
  client: PoolClient,
  bindingId: string,
  requiredState: "PROPOSED" | "AUTHORIZED" | "CONSUMED",
) {
  const result = await client.query(
    [
      "select b.*,",
      "c.verification_status as claim_status,c.verifier_method,c.verifier_actor,",
      "c.source_kind as claim_source_kind,c.artifact_sha256 as claim_artifact_sha256,",
      "a.method as origin_method,a.verifier_actor as origin_actor,",
      "a.proof_sha256 as origin_proof_sha256,a.independent_evidence_reference,",
      "a.expires_at as origin_expires_at,a.artifact_sha256 as origin_artifact_sha256,",
      "ch.kind as channel_kind,ch.active as channel_active,",
      "(ch.created_at < art.created_at) as channel_predates_artifact,",
      "art.sha256 as current_artifact_sha256,",
      "v.name as current_vendor_name,v.normal_max_amount_cents,",
      "vd.destination as current_destination,vd.trusted as destination_trusted,",
      "p.active as policy_active,p.auto_pay_max_amount_cents",
      "from payment_authority_bindings b",
      "join invoice_verified_claim_sets c",
      "on c.id=b.verified_claim_set_id and c.organization_id=b.organization_id",
      "and c.artifact_id=b.artifact_id",
      "join invoice_origin_attestations a",
      "on a.id=b.origin_attestation_id and a.organization_id=b.organization_id",
      "and a.artifact_id=b.artifact_id and a.vendor_id=b.vendor_id",
      "join vendor_origin_channels ch on ch.id=a.origin_channel_id",
      "and ch.organization_id=b.organization_id and ch.vendor_id=b.vendor_id",
      "join invoice_artifacts art on art.id=b.artifact_id",
      "and art.organization_id=b.organization_id",
      "join vendors v on v.id=b.vendor_id and v.organization_id=b.organization_id",
      "join vendor_destinations vd on vd.id=b.destination_id and vd.vendor_id=b.vendor_id",
      "join policies p on p.id=b.policy_id and p.organization_id=b.organization_id",
      "where b.id=$1 for share",
    ].join(" "),
    [bindingId],
  );
  const b = result.rows[0];
  if (!b) refuse("BINDING_OR_SOURCE_NOT_FOUND");
  if (b.authorization_status !== requiredState) refuse("BINDING_STATE_NOT_AUTHORIZED");
  if (b.proposed_outcome !== "ESCALATE" ||
    JSON.stringify(b.proposed_reason_codes) !== JSON.stringify(["PENDING_EXACT_HUMAN_APPROVAL"])) {
    refuse("BINDING_OUTCOME_NOT_APPROVABLE");
  }
  const now = Date.now();
  if (new Date(b.expires_at).getTime() <= now ||
    new Date(b.origin_expires_at).getTime() <= now) refuse("BINDING_OR_ORIGIN_EXPIRED");
  if (!b.channel_active || !b.channel_predates_artifact ||
    b.channel_kind === "SYNTHETIC_FIXTURE" ||
    b.origin_method !== "ADMIN_OUT_OF_BAND" || !b.origin_proof_sha256 ||
    !b.independent_evidence_reference) refuse("ISSUER_ORIGIN_NOT_TRUSTED");
  if (b.claim_status !== "VERIFIED" ||
    b.verifier_method !== "ADMIN_EXPLICIT" ||
    !["HUMAN_TRANSCRIPTION", "PDF_TEXT"].includes(b.claim_source_kind)) {
    refuse("CLAIM_NOT_INDEPENDENTLY_VERIFIED");
  }
  if (b.artifact_sha256 !== b.current_artifact_sha256 ||
    b.claim_artifact_sha256 !== b.current_artifact_sha256 ||
    b.origin_artifact_sha256 !== b.current_artifact_sha256) refuse("SOURCE_DIGEST_CHANGED");

  const actors = [b.verifier_actor, b.origin_actor];
  if (requiredState !== "PROPOSED") {
    if (!b.approval_actor || !b.approval_proof_sha256) refuse("APPROVAL_NOT_ATTESTED");
    actors.push(b.approval_actor);
  }
  const members = await client.query(
    [
      "select user_id from organization_admin_memberships",
      "where organization_id=$1 and role='ADMIN' and active=true",
      "and user_id = any($2::text[]) for share",
    ].join(" "),
    [b.organization_id,actors],
  );
  if (new Set(members.rows.map(x=>x.user_id)).size !== new Set(actors).size) {
    refuse("REQUIRED_REVIEWER_NO_LONGER_AUTHORIZED");
  }

  if (!b.destination_trusted || !b.policy_active) refuse("DESTINATION_OR_POLICY_REVOKED");
  const currentDest = await client.query(
    "select id from vendor_destinations where vendor_id=$1 and trusted=true order by created_at desc,id desc limit 1",
    [b.vendor_id],
  );
  if (currentDest.rows[0]?.id !== b.destination_id) refuse("CURRENT_TRUSTED_DESTINATION_CHANGED");
  const currentPolicy = await client.query(
    "select id from policies where organization_id=$1 and active=true order by created_at desc,id desc limit 1",
    [b.organization_id],
  );
  if (currentPolicy.rows[0]?.id !== b.policy_id) refuse("CURRENT_POLICY_CHANGED");

  const values = await client.query(
    [
      "select field_name,normalized_value,trust_tier,verifier_proof_sha256,",
      "source_quote_sha256,source_parser_version,source_page_text_sha256",
      "from invoice_claim_field_sources",
      "where organization_id=$1 and artifact_id=$2 and claim_set_id=$3 for share",
    ].join(" "),
    [b.organization_id,b.artifact_id,b.verified_claim_set_id],
  );
  const found = new Map<string,string>();
  for(const f of values.rows) {
    if(criticalFields.some(x=>x===f.field_name)) {
      if(found.has(f.field_name) || f.trust_tier!==2 ||
        !f.verifier_proof_sha256 || !f.source_quote_sha256 || !f.normalized_value ||
        (b.claim_source_kind==="PDF_TEXT" &&
          (f.source_parser_version!==PDF_SOURCE_PARSER_VERSION ||
           !f.source_page_text_sha256))) {
        refuse("FIELD_ORIGIN_NOT_VERIFIED");
      }
      found.set(f.field_name,f.normalized_value);
    }
  }
  if(criticalFields.some(x=>!found.has(x)))refuse("FIELD_ORIGIN_NOT_VERIFIED");
  const amount=invoiceDecimalToCents(found.get("total_amount_decimal")!);
  const currency=found.get("currency")!;
  const invoiceNumber=found.get("invoice_number")!;
  const recipient=found.get("invoice_payment_destination")!;
  if (amount===null || currency!=="USD" ||
    amount!==b.amount_cents || currency!==b.currency ||
    invoiceNumber!==b.invoice_number ||
    b.current_vendor_name.trim()!==found.get("vendor_name")!.trim() ||
    recipient!==b.current_destination ||
    sha(b.current_destination)!==b.destination_sha256 ||
    amount>b.normal_max_amount_cents ||
    amount>b.auto_pay_max_amount_cents) {
    refuse("BOUND_PAYMENT_PARAMETERS_CHANGED");
  }

  const policyHash=sha([
    "mandategate/policy-snapshot/v1",
    b.policy_id,
    String(b.auto_pay_max_amount_cents),
    String(b.normal_max_amount_cents),
  ].join("\0"));
  if(policyHash!==b.policy_snapshot_sha256)refuse("CURRENT_POLICY_VERSION_CHANGED");
  const tupleSha256=hashPaymentAuthorityTuple({
    organizationId:b.organization_id,artifactId:b.artifact_id,
    artifactSha256:b.artifact_sha256,claimSetId:b.verified_claim_set_id,
    originAttestationId:b.origin_attestation_id,vendorId:b.vendor_id,
    destinationId:b.destination_id,trustedDestination:b.current_destination,
    policyId:b.policy_id,policySnapshotSha256:policyHash,
    invoiceNumber:b.invoice_number,amountCents:b.amount_cents,currency:b.currency,
  });
  if(tupleSha256!==b.tuple_sha256)refuse("BOUND_PAYMENT_TUPLE_HASH_MISMATCH");
  if(requiredState==="CONSUMED" && (!b.linked_payment_request_id || !b.consumed_at)) {
    refuse("BINDING_NOT_CONSUMED");
  }
  return {
    bindingId:b.id as string,
    organizationId:b.organization_id as string,
    artifactId:b.artifact_id as string,
    vendorId:b.vendor_id as string,
    destinationId:b.destination_id as string,
    recipient:b.current_destination as string,
    policyId:b.policy_id as string,
    amountCents:b.amount_cents as number,
    invoiceNumber:b.invoice_number as string,
    currency:b.currency as string,
    tupleSha256:b.tuple_sha256 as string,
    linkedRequestId:(b.linked_payment_request_id??null) as string | null,
    approvalActor:(b.approval_actor??null) as string | null,
  };
}
