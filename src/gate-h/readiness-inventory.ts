import { pool } from "../db/pool";

const organizationPattern = /^[A-Za-z0-9_-]{1,120}$/;

export type GateHInventoryCounts = {
  invoiceArtifacts: number;
  independentPdfPages: number;
  pdfArtifactsWithPages: number;
  verifiedPdfClaims: number;
  activeEnrolledChannels: number;
  eligiblePreexistingChannelInvoicePairs: number;
  currentHumanOriginAttestations: number;
  authorizedBindings: number;
  consentedSyntheticGlmObservations: number;
  invoicePaymentRequests: number;
  allPaymentExecutions: number;
};

export type GateHInventory = {
  contract: "mandategate/gate-h-readonly-inventory/v1";
  organizationId: string;
  status: "BLOCKED";
  payoutAuthorized: false;
  externalRequestsMade: false;
  counts: GateHInventoryCounts;
  tiers: {
    t0Source: "RECORDED" | "MISSING";
    t1Model: "SYNTHETIC_ADVISORY_ONLY" | "NOT_OBSERVED";
    t2VerifiedSource: "RECORDED_REQUIRES_REVIEW" | "MISSING";
    t3IssuerOrigin: "HUMAN_ATTESTATION_REQUIRES_REVIEW" | "MISSING";
    t4ExactBinding: "RECORDED_REQUIRES_REVIEW" | "MISSING";
    strictPrivacy: "NOT_EVALUATED";
    paypalSandbox: "LOCAL_EXECUTIONS_REQUIRE_EXTERNAL_RECONCILIATION" | "NO_CURRENT_EXECUTIONS";
  };
  blockers: string[];
  limitation: string;
};

/**
 * Read-side INVENTORY only, not an approval or a finance executor preflight.
 *
 * No external provider request, protected payment action, or INSERT/UPDATE is
 * reachable from this function. Existence counts do not prove an issuer's
 * actual identity, a model provider's full ZDR, or PayPal settlement.
 */
export const GATE_H_INVENTORY_SQL = [
  "with artifacts as (",
  "  select count(*)::int as n from invoice_artifacts where organization_id=$1",
  "), pdf_pages as (",
  "  select count(*)::int as n, count(distinct artifact_id)::int as artifacts",
  "  from invoice_pdf_source_pages where organization_id=$1",
  "), verified_pdf as (",
  "  select count(*)::int as n from invoice_verified_claim_sets",
  "  where organization_id=$1 and source_kind='PDF_TEXT' and verification_status='VERIFIED'",
  "), channels as (",
  "  select count(*)::int as n from vendor_origin_channels",
  "  where organization_id=$1 and active=true and kind <> 'SYNTHETIC_FIXTURE'",
  "), eligible_pairs as (",
  "  select count(*)::int as n from invoice_artifacts art",
  "  join vendor_origin_channels ch on ch.organization_id=art.organization_id",
  "    and ch.active=true and ch.kind <> 'SYNTHETIC_FIXTURE'",
  "    and ch.created_at < art.created_at",
  "  where art.organization_id=$1",
  "), origin as (",
  "  select count(*)::int as n from invoice_origin_attestations a",
  "  join vendor_origin_channels ch on ch.id=a.origin_channel_id",
  "    and ch.organization_id=a.organization_id and ch.vendor_id=a.vendor_id",
  "  join invoice_artifacts art on art.id=a.artifact_id",
  "    and art.organization_id=a.organization_id",
  "  where a.organization_id=$1 and a.method='ADMIN_OUT_OF_BAND'",
  "    and a.expires_at>now() and a.artifact_sha256=art.sha256",
  "    and ch.active=true and ch.kind <> 'SYNTHETIC_FIXTURE'",
  "    and ch.created_at < art.created_at",
  "), bindings as (",
  "  select count(*)::int as n from payment_authority_bindings",
  "  where organization_id=$1 and authorization_status='AUTHORIZED'",
  "), synthetic as (",
  "  select count(*)::int as n from invoice_image_observations o",
  "  join invoice_artifacts art on art.id=o.artifact_id",
  "    and art.organization_id=o.organization_id",
  "  where o.organization_id=$1 and o.state='ESCALATE' and o.error_code is null",
  "    and o.reason_codes @> '[\"SYNTHETIC_NON_ZDR_TEST_ONLY\"]'::jsonb",
  "    and exists (select 1 from invoice_synthetic_non_zdr_test_consents c",
  "      where c.organization_id=o.organization_id and c.artifact_id=o.artifact_id",
  "        and c.source_sha256=art.sha256)",
  "), invoice_requests as (",
  "  select count(*)::int as n from payment_requests",
  "  where organization_id=$1 and source='verified_invoice'",
  "), executions as (",
  "  select count(*)::int as n from payment_executions e",
  "  join payment_requests pr on pr.id=e.payment_request_id",
  "  where pr.organization_id=$1",
  ")",
  "select artifacts.n as invoice_artifacts, pdf_pages.n as independent_pdf_pages,",
  " pdf_pages.artifacts as pdf_artifacts_with_pages,",
  " verified_pdf.n as verified_pdf_claims, channels.n as active_enrolled_channels,",
  " eligible_pairs.n as eligible_preexisting_channel_invoice_pairs,",
  " origin.n as current_human_origin_attestations,",
  " bindings.n as authorized_bindings,",
  " synthetic.n as consented_synthetic_glm_observations,",
  " invoice_requests.n as invoice_payment_requests,",
  " executions.n as all_payment_executions",
  " from artifacts,pdf_pages,verified_pdf,channels,eligible_pairs,origin,bindings,synthetic,invoice_requests,executions",
].join(" ");

function count(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  const number = typeof value === "string" && /^[0-9]+$/.test(value)
    ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) {
    throw new Error("GATE_H_INVENTORY_INVALID_COUNT:" + key);
  }
  return number;
}

export function classifyGateHInventory(
  organizationId: string,
  raw: Record<string, unknown>,
): GateHInventory {
  if (!organizationPattern.test(organizationId))
    throw new Error("GATE_H_INVENTORY_INVALID_ORGANIZATION");

  const counts: GateHInventoryCounts = {
    invoiceArtifacts: count(raw, "invoice_artifacts"),
    independentPdfPages: count(raw, "independent_pdf_pages"),
    pdfArtifactsWithPages: count(raw, "pdf_artifacts_with_pages"),
    verifiedPdfClaims: count(raw, "verified_pdf_claims"),
    activeEnrolledChannels: count(raw, "active_enrolled_channels"),
    eligiblePreexistingChannelInvoicePairs: count(raw, "eligible_preexisting_channel_invoice_pairs"),
    currentHumanOriginAttestations: count(raw, "current_human_origin_attestations"),
    authorizedBindings: count(raw, "authorized_bindings"),
    consentedSyntheticGlmObservations: count(raw, "consented_synthetic_glm_observations"),
    invoicePaymentRequests: count(raw, "invoice_payment_requests"),
    allPaymentExecutions: count(raw, "all_payment_executions"),
  };
  const blockers: string[] = [];
  if (counts.invoiceArtifacts === 0) blockers.push("T0_NO_STORED_INVOICES");
  if (counts.independentPdfPages === 0) blockers.push("T2_PDF_PAGES_NOT_PREPARED");
  if (counts.verifiedPdfClaims === 0) blockers.push("T2_NO_VERIFIED_PDF_FACTS");
  if (counts.eligiblePreexistingChannelInvoicePairs === 0)
    blockers.push("T3_NO_ELIGIBLE_PREEXISTING_CHANNEL_INVOICE_PAIR");
  if (counts.currentHumanOriginAttestations === 0)
    blockers.push("T3_NO_CURRENT_NON_SYNTHETIC_ORIGIN_ATTESTATION");
  if (counts.authorizedBindings === 0) blockers.push("T4_NO_AUTHORIZED_BINDING");
  blockers.push("STRICT_PROVIDER_PRIVACY_REQUIRES_SEPARATE_EXTERNAL_PROOF");
  blockers.push("PAYPAL_PAYOUT_REQUIRES_EXACT_AUTHORIZATION_AND_EXTERNAL_RECONCILIATION");

  return {
    contract: "mandategate/gate-h-readonly-inventory/v1",
    organizationId,
    status: "BLOCKED",
    payoutAuthorized: false,
    externalRequestsMade: false,
    counts,
    tiers: {
      t0Source: counts.invoiceArtifacts ? "RECORDED" : "MISSING",
      t1Model: counts.consentedSyntheticGlmObservations
        ? "SYNTHETIC_ADVISORY_ONLY" : "NOT_OBSERVED",
      t2VerifiedSource: counts.verifiedPdfClaims
        ? "RECORDED_REQUIRES_REVIEW" : "MISSING",
      t3IssuerOrigin: counts.currentHumanOriginAttestations
        ? "HUMAN_ATTESTATION_REQUIRES_REVIEW" : "MISSING",
      t4ExactBinding: counts.authorizedBindings
        ? "RECORDED_REQUIRES_REVIEW" : "MISSING",
      strictPrivacy: "NOT_EVALUATED",
      paypalSandbox: counts.allPaymentExecutions
        ? "LOCAL_EXECUTIONS_REQUIRE_EXTERNAL_RECONCILIATION"
        : "NO_CURRENT_EXECUTIONS",
    },
    blockers,
    limitation:
      "Read-only row existence is not a verified T2/T3/T4 chain, provider ZDR attestation, PayPal settlement, or permission to execute a payout.",
  };
}

export async function readGateHInventory(organizationId: string): Promise<GateHInventory> {
  if (!organizationPattern.test(organizationId))
    throw new Error("GATE_H_INVENTORY_INVALID_ORGANIZATION");
  const result = await pool.query(GATE_H_INVENTORY_SQL, [organizationId]);
  if (result.rows.length !== 1 || !result.rows[0])
    throw new Error("GATE_H_INVENTORY_UNAVAILABLE");
  return classifyGateHInventory(organizationId, result.rows[0]);
}
