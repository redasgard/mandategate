import { createHash } from "node:crypto";
import { z } from "zod";

// These are representation contracts only. A valid digest, typed record or
// model citation never grants payment authority.
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const uuidSchema = z.string().uuid();

const claimFieldNameSchema = z.enum([
  "vendor_name",
  "invoice_number",
  "invoice_date",
  "due_date",
  "currency",
  "total_amount_decimal",
  "invoice_payment_destination",
]);

const fieldEvidenceSchema = z.object({
  fieldName: claimFieldNameSchema,
  observedValue: z.string().max(1000).nullable(),
  sourcePage: z.number().int().min(1).max(20).nullable(),
  sourceQuoteSha256: digestSchema.nullable(),
}).strict();

export const unverifiedClaimInputSchema = z.object({
  organizationId: z.string().min(1).max(120),
  artifactId: uuidSchema,
  artifactSha256: digestSchema,
  observationSha256: digestSchema,
  sourceKind: z.enum(["GLM_IMAGE", "PDF_TEXT", "HUMAN_TRANSCRIPTION"]),
  fields: z.array(fieldEvidenceSchema).min(1).max(7),
}).strict().superRefine((candidate, ctx) => {
  const found = new Set<string>();
  for (const field of candidate.fields) {
    if (found.has(field.fieldName)) {
      ctx.addIssue({ code: "custom", message: "DUPLICATE_UNTRUSTED_FIELD" });
      break;
    }
    found.add(field.fieldName);
  }
});

export type UnverifiedClaimInput = z.infer<typeof unverifiedClaimInputSchema>;

export const paymentTupleSchema = z.object({
  organizationId: z.string().min(1).max(120),
  artifactId: uuidSchema,
  artifactSha256: digestSchema,
  claimSetId: uuidSchema,
  originAttestationId: uuidSchema,
  vendorId: z.string().min(1).max(120),
  destinationId: z.string().min(1).max(120),
  trustedDestination: z.string().min(3).max(320),
  policyId: z.string().min(1).max(120),
  policySnapshotSha256: digestSchema,
  invoiceNumber: z.string().min(1).max(120),
  amountCents: z.number().int().positive().max(2_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).strict();

export type PaymentAuthorityTuple = z.infer<typeof paymentTupleSchema>;

function hashCanonicalParts(domain: string, values: readonly (readonly [string, string])[]) {
  const sha = createHash("sha256").update(domain + "\0", "utf8");
  for (const [field, value] of values) {
    const fieldBytes = Buffer.from(field, "utf8");
    const valueBytes = Buffer.from(value, "utf8");
    const header = Buffer.from(
      String(fieldBytes.length) + ":" + String(valueBytes.length) + ":",
      "ascii",
    );
    sha.update(header).update(fieldBytes).update(valueBytes);
  }
  return sha.digest("hex");
}

export function hashUnverifiedClaimSnapshot(input: unknown): string {
  const claim = unverifiedClaimInputSchema.parse(input);
  const parts: [string, string][] = [
    ["organization", claim.organizationId],
    ["artifact_id", claim.artifactId],
    ["artifact_sha256", claim.artifactSha256],
    ["observation_sha256", claim.observationSha256],
    ["source_kind", claim.sourceKind],
  ];
  for (const field of [...claim.fields].sort((a,b) => a.fieldName.localeCompare(b.fieldName))) {
    parts.push(["field_name", field.fieldName]);
    parts.push(["raw_value", field.observedValue ?? "<NULL>"]);
    parts.push(["source_page", field.sourcePage?.toString() ?? "<NULL>"]);
    parts.push(["quote_sha256", field.sourceQuoteSha256 ?? "<NULL>"]);
  }
  return hashCanonicalParts("mandategate/unverified-claim/v1", parts);
}

export function hashPaymentAuthorityTuple(input: unknown): string {
  // Hashing is for exact tuple identity / change detection, NOT a signature
  // or a grant. Gate E must independently verify authority and version state.
  const p = paymentTupleSchema.parse(input);
  return hashCanonicalParts("mandategate/payment-tuple/v1", [
    ["organization", p.organizationId],
    ["artifact_id", p.artifactId],
    ["artifact_sha256", p.artifactSha256],
    ["claim_set_id", p.claimSetId],
    ["attestation_id", p.originAttestationId],
    ["vendor_id", p.vendorId],
    ["destination_id", p.destinationId],
    ["trusted_destination", p.trustedDestination],
    ["policy_id", p.policyId],
    ["policy_sha256", p.policySnapshotSha256],
    ["invoice_number", p.invoiceNumber],
    ["amount_cents", p.amountCents.toString()],
    ["currency", p.currency],
  ]);
}
