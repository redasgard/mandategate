import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool";
import { invoiceDecimalToCents } from "../invoices/normalize";
import { PDF_SOURCE_PARSER_VERSION } from "../invoices/pdf-text";
import { evaluatePayment } from "../policy/decision";
import { hashPaymentAuthorityTuple } from "./contracts";

const requiredFields = [
  "vendor_name", "invoice_number", "currency",
  "total_amount_decimal", "invoice_payment_destination",
] as const;

function sha(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

type ProposalOutcome = "ALLOW" | "ESCALATE" | "DENY";
type ProposalResult = {
  outcome: ProposalOutcome;
  reasonCodes: string[];
  bindingId: string | null;
  tupleSha256: string | null;
  traceId: string;
  paymentAuthorized: false;
};

const PROPOSAL_TTL_MS = 60 * 60 * 1000;

/**
 * Gate E proposal only. This never writes to payment_requests or PayPal and
 * never upgrades model-produced information into authorization.
 *
 * It accepts ONLY immutable claim/attestation IDs; financial selectors and
 * destination are resolved server-side from verified sources and registry.
 */
export async function prepareInvoicePaymentProposal(input: {
  organizationId: string;
  artifactId: string;
  claimSetId: string;
  attestationId: string;
}): Promise<ProposalResult> {
  const traceId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const refuse = async (outcome: ProposalOutcome, reasonCodes: string[]): Promise<ProposalResult> => {
      // Prove denied/held value flows even when there is no authorized binding.
      const fragment = sha(reasonCodes.join("|"));
      await client.query(
        [
          "insert into parameter_lineage_events",
          "(trace_id, sequence, organization_id, artifact_id, source_kind, trust_tier,",
          "event_type, field_name, observed_value_sha256, sink_component, sink_field)",
          "values ($1,1,$2,$3,'POLICY',0,$4,'authority_decision',$5,",
          "'payment_proposal','authorization')",
        ].join(" "),
        [traceId, input.organizationId, input.artifactId, outcome, fragment],
      );
      return { outcome, reasonCodes, bindingId: null, tupleSha256: null, traceId, paymentAuthorized: false };
    };

    const artifact = await client.query(
      "select id, sha256 from invoice_artifacts where organization_id=$1 and id=$2 for share",
      [input.organizationId,input.artifactId],
    );
    if (!artifact.rows[0]) {
      // No cross-tenant trace: don't disclose whether another tenant has ID.
      await client.query("rollback");
      return { outcome: "DENY", reasonCodes: ["SOURCE_ARTIFACT_NOT_OWNED"], bindingId: null, tupleSha256: null, traceId, paymentAuthorized: false };
    }
    const sourceHash = artifact.rows[0].sha256 as string;

    const claim = await client.query(
      [
        "select c.id,c.verification_status,c.verifier_method,c.verifier_actor,c.artifact_sha256,c.source_kind",
        "from invoice_verified_claim_sets c",
        "where c.id=$1 and c.organization_id=$2 and c.artifact_id=$3",
        "for share",
      ].join(" "),
      [input.claimSetId,input.organizationId,input.artifactId],
    );
    const verified = claim.rows[0];
    if (!verified || verified.artifact_sha256 !== sourceHash ||
      verified.verification_status !== "VERIFIED" ||
      verified.verifier_method !== "ADMIN_EXPLICIT" ||
      !["HUMAN_TRANSCRIPTION","PDF_TEXT"].includes(verified.source_kind)) {
      const held = await refuse("ESCALATE", ["SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED"]);
      await client.query("commit");
      return held;
    }

    const human = await client.query(
      "select user_id from organization_admin_memberships where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true for share",
      [verified.verifier_actor,input.organizationId],
    );
    if (!human.rows[0]) {
      const held = await refuse("ESCALATE",["SOURCE_VERIFIER_NOT_AUTHORIZED"]);
      await client.query("commit");
      return held;
    }

    const fields = await client.query(
      [
        "select field_name,normalized_value,trust_tier,source_quote_sha256,verifier_proof_sha256,",
        "source_parser_version,source_page_text_sha256",
        "from invoice_claim_field_sources where claim_set_id=$1 and organization_id=$2 and artifact_id=$3",
        "for share",
      ].join(" "),
      [input.claimSetId,input.organizationId,input.artifactId],
    );
    const found = new Map<string,string>();
    for (const row of fields.rows) {
      if (requiredFields.some((x) => x === row.field_name)) {
        if (found.has(row.field_name) || row.trust_tier !== 2 ||
          !row.verifier_proof_sha256 || !row.normalized_value ||
          !row.source_quote_sha256 ||
          (verified.source_kind==="PDF_TEXT" &&
           (row.source_parser_version!==PDF_SOURCE_PARSER_VERSION ||
            !row.source_page_text_sha256))) {
          const held = await refuse("ESCALATE",["SOURCE_FIELD_PROOF_INCOMPLETE"]);
          await client.query("commit");
          return held;
        }
        found.set(row.field_name,row.normalized_value);
      }
    }
    if (requiredFields.some((field)=>!found.has(field))) {
      const held = await refuse("ESCALATE",["SOURCE_FIELD_PROOF_INCOMPLETE"]);
      await client.query("commit");
      return held;
    }

    const att = await client.query(
      [
        "select a.id,a.vendor_id,a.method,a.verifier_actor,a.expires_at,a.artifact_sha256,",
        "ch.kind,ch.active,(ch.created_at < art.created_at) as channel_predates_artifact",
        "from invoice_origin_attestations a",
        "join vendor_origin_channels ch on ch.id=a.origin_channel_id",
        "and ch.organization_id=a.organization_id and ch.vendor_id=a.vendor_id",
        "join invoice_artifacts art on art.id=a.artifact_id",
        "and art.organization_id=a.organization_id",
        "where a.id=$1 and a.organization_id=$2 and a.artifact_id=$3",
        "for share of a, ch, art",
      ].join(" "),
      [input.attestationId,input.organizationId,input.artifactId],
    );
    const attested = att.rows[0];
    if (!attested || attested.artifact_sha256 !== sourceHash ||
      !attested.active || new Date(attested.expires_at).getTime() <= Date.now()) {
      const held = await refuse("ESCALATE",["ISSUER_ORIGIN_UNVERIFIED_OR_EXPIRED"]);
      await client.query("commit");
      return held;
    }
    if (attested.channel_predates_artifact !== true) {
      const held = await refuse("ESCALATE",["TRUSTED_CHANNEL_MUST_PREDATE_INVOICE"]);
      await client.query("commit");
      return held;
    }
    if (attested.kind === "SYNTHETIC_FIXTURE" || attested.method === "SYNTHETIC_FIXTURE") {
      // Test-only fixture issuer claims must never become real proposal authority.
      const held = await refuse("ESCALATE",["SYNTHETIC_ISSUER_NOT_REAL_AUTHORITY"]);
      await client.query("commit");
      return held;
    }
    if (attested.method !== "ADMIN_OUT_OF_BAND") {
      const held = await refuse("ESCALATE",["UNSUPPORTED_ORIGIN_ATTESTATION"]);
      await client.query("commit");
      return held;
    }
    const originHuman = await client.query(
      "select user_id from organization_admin_memberships where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true for share",
      [attested.verifier_actor,input.organizationId],
    );
    if (!originHuman.rows[0]) {
      const held = await refuse("ESCALATE",["ISSUER_ATTESTOR_NOT_AUTHORIZED"]);
      await client.query("commit");
      return held;
    }

    const vendor = await client.query(
      "select id,name,normal_max_amount_cents from vendors where id=$1 and organization_id=$2 for share",
      [attested.vendor_id,input.organizationId],
    );
    if (!vendor.rows[0] || vendor.rows[0].name.trim() !== found.get("vendor_name")?.trim()) {
      const held = await refuse("ESCALATE",["VENDOR_IDENTITY_UNCORROBORATED"]);
      await client.query("commit");
      return held;
    }
    const destination = await client.query(
      [
        "select id,destination from vendor_destinations",
        "where vendor_id=$1 and trusted=true",
        "order by created_at desc,id desc limit 1 for share",
      ].join(" "),
      [attested.vendor_id],
    );
    if (!destination.rows[0]) {
      const held = await refuse("DENY",["TRUSTED_DESTINATION_NOT_FOUND"]);
      await client.query("commit");
      return held;
    }
    // Receiver is registry-owned. The invoice can only trigger a hard mismatch.
    const observedReceiver = found.get("invoice_payment_destination")!;
    const registryReceiver = destination.rows[0].destination as string;
    if (observedReceiver !== registryReceiver) {
      const denied = await refuse("DENY",["INVOICE_DESTINATION_SUBSTITUTION"]);
      await client.query("commit");
      return denied;
    }

    const policy = await client.query(
      [
        "select id,auto_pay_max_amount_cents,active from policies",
        "where organization_id=$1 and active=true",
        "order by created_at desc,id desc limit 1 for share",
      ].join(" "),
      [input.organizationId],
    );
    if (!policy.rows[0]) {
      const held = await refuse("ESCALATE",["ACTIVE_POLICY_NOT_FOUND"]);
      await client.query("commit");
      return held;
    }
    const amountCents = invoiceDecimalToCents(found.get("total_amount_decimal")!);
    const currency = found.get("currency")!;
    if (amountCents === null || !/^[A-Z]{3}$/.test(currency) || currency !== "USD") {
      const held = await refuse("ESCALATE",["AMOUNT_OR_CURRENCY_UNSUPPORTED"]);
      await client.query("commit");
      return held;
    }

    const decision = evaluatePayment({
      amountCents,currency,
      requestedDestination:registryReceiver,
      trustedDestination:registryReceiver,
      vendorNormalMaxAmountCents:vendor.rows[0].normal_max_amount_cents,
      policyAutoPayMaxAmountCents:policy.rows[0].auto_pay_max_amount_cents,
    });
    if (decision.outcome !== "ALLOW") {
      const held = await refuse(decision.outcome,decision.reasonCodes);
      await client.query("commit");
      return held;
    }

    const duplicate = await client.query(
      [
        "select id from payment_requests",
        "where organization_id=$1 and vendor_id=$2 and invoice_number=$3 limit 1",
      ].join(" "),
      [input.organizationId,attested.vendor_id,found.get("invoice_number")!],
    );
    if (duplicate.rows[0]) {
      const held = await refuse("ESCALATE",["POSSIBLE_DUPLICATE_INVOICE"]);
      await client.query("commit");
      return held;
    }

    const policyHash = sha([
      "mandategate/policy-snapshot/v1",
      policy.rows[0].id,
      String(policy.rows[0].auto_pay_max_amount_cents),
      String(vendor.rows[0].normal_max_amount_cents),
    ].join("\0"));

    const proposed = {
      organizationId:input.organizationId,
      artifactId:input.artifactId,
      artifactSha256:sourceHash,
      claimSetId:input.claimSetId,
      originAttestationId:input.attestationId,
      vendorId:attested.vendor_id as string,
      destinationId:destination.rows[0].id as string,
      trustedDestination:registryReceiver,
      policyId:policy.rows[0].id as string,
      policySnapshotSha256:policyHash,
      invoiceNumber:found.get("invoice_number")!,
      amountCents,
      currency,
    };
    const tupleSha256=hashPaymentAuthorityTuple(proposed);
    const result=await client.query(
      [
        "insert into payment_authority_bindings",
        "(organization_id,artifact_id,artifact_sha256,verified_claim_set_id,origin_attestation_id,",
        "vendor_id,destination_id,policy_id,invoice_number,amount_cents,currency,",
        "destination_sha256,policy_snapshot_sha256,tuple_sha256,expires_at,",
        "proposed_outcome,proposed_reason_codes)",
        "values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'ESCALATE','[\"PENDING_EXACT_HUMAN_APPROVAL\"]'::jsonb)",
        "on conflict (organization_id,artifact_id,tuple_sha256) do nothing returning id",
      ].join(" "),
      [
        proposed.organizationId,proposed.artifactId,proposed.artifactSha256,
        proposed.claimSetId,proposed.originAttestationId,proposed.vendorId,proposed.destinationId,
        proposed.policyId,proposed.invoiceNumber,proposed.amountCents,proposed.currency,
        sha(registryReceiver),policyHash,tupleSha256,new Date(Date.now()+PROPOSAL_TTL_MS),
      ],
    );
    let bindingId=result.rows[0]?.id as string | undefined;
    if(!bindingId) {
      const existing=await client.query(
        "select id from payment_authority_bindings where organization_id=$1 and artifact_id=$2 and tuple_sha256=$3",
        [input.organizationId,input.artifactId,tupleSha256],
      );
      bindingId=existing.rows[0]?.id;
    }
    if(!bindingId)throw new Error("AUTHORITY_BINDING_INSERT_FAILED");

    // One actual trace of the values selected for the privileged proposal sink.
    let sequence=1;
    for(const name of requiredFields) {
      await client.query(
        [
          "insert into parameter_lineage_events",
          "(trace_id,sequence,organization_id,artifact_id,claim_set_id,binding_id,",
          "source_kind,trust_tier,event_type,source_record_id,field_name,",
          "observed_value_sha256,normalized_value_sha256,sink_component,sink_field)",
          "values($1,$2,$3,$4,$5,$6,'VERIFIER',2,'PROPOSAL_FIELD_SELECTED',$7,$8,$9,$10,",
          "'authority.payment_proposal',$8)",
        ].join(" "),
        [
          traceId,sequence++,input.organizationId,input.artifactId,input.claimSetId,
          bindingId,input.claimSetId,name,sha(found.get(name)!),sha(found.get(name)!),
        ],
      );
    }
    await client.query("commit");
    return {outcome:"ESCALATE",reasonCodes:["PENDING_EXACT_HUMAN_APPROVAL"],bindingId,tupleSha256,traceId,paymentAuthorized:false};
  } catch(error) {
    await client.query("rollback").catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}
