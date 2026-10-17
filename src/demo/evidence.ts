import { pool } from "@/src/db/pool";
import { invoiceExtractionSchema } from "@/src/invoices/schema";
import { DEMO_ORG_ID } from "./scenarios";
import { assertDemoPreview, DemoScenarioError } from "./scenarios-store";

export type DemoModelFinding = {
  artifactId: string;
  sourceShaPrefix: string;
  model: string;
  provider: string | null;
  requestId: string | null;
  invoiceNumber: string | null;
  vendor: string | null;
  amount: string | null;
  currency: string | null;
  reasonCodes: string[];
  fieldsSchemaValid: boolean;
};

export type DemoEvidence = {
  findings: DemoModelFinding[];
  /** All local execution rows in the demo org, regardless of request source. */
  organizationExecutionRows: number;
};

const compact = (value: unknown, max = 128): string | null =>
  typeof value === "string" && value.trim().length
    ? value.trim().slice(0, max)
    : null;

/**
 * Existing, saved GLM T1 results from consented fictional-only observations.
 * This is a read-only evidence index, not new inference or payment authorization.
 * All rows must be authorized for the signed-in admin and bound to the exact
 * source hash consented to before the model request.
 */
export async function readDemoEvidence(adminUserId: string): Promise<DemoEvidence> {
  assertDemoPreview();

  const membership = await pool.query(
    "select 1 from organization_admin_memberships where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true limit 1",
    [DEMO_ORG_ID, adminUserId],
  );
  if (membership.rows.length !== 1)
    throw new DemoScenarioError("DEMO_ADMIN_NOT_FOUND", 404);

  const [observed, executions] = await Promise.all([
    pool.query([
      "select a.id,a.sha256,o.model,o.provider_name,o.gateway_request_id,",
      "o.extraction,o.reason_codes from invoice_image_observations o",
      "join invoice_artifacts a on a.id=o.artifact_id and a.organization_id=o.organization_id",
      "and o.input_sha256=a.sha256",
      "where o.organization_id=$1 and o.state='ESCALATE' and o.error_code is null",
      "and o.reason_codes @> '[\"SYNTHETIC_NON_ZDR_TEST_ONLY\"]'::jsonb",
      "and exists (select 1 from organization_admin_memberships m",
      "  where m.organization_id=o.organization_id and m.user_id=$2",
      "  and m.role='ADMIN' and m.active=true)",
      "and exists (select 1 from invoice_synthetic_non_zdr_test_consents c",
      "  where c.artifact_id=a.id and c.organization_id=a.organization_id",
      "  and c.source_sha256=a.sha256)",
      "order by o.finished_at desc,o.artifact_id desc limit 3",
    ].join(" "), [DEMO_ORG_ID, adminUserId]),
    pool.query([
      "select count(*)::int as n from payment_executions e",
      "join payment_requests pr on pr.id=e.payment_request_id",
      "where pr.organization_id=$1", 
      "and exists (select 1 from organization_admin_memberships m",
      "  where m.organization_id=pr.organization_id and m.user_id=$2",
      "  and m.role='ADMIN' and m.active=true)",
    ].join(" "), [DEMO_ORG_ID, adminUserId]),
  ]);

  // A count for verified_invoice only could conceal a direct trusted-agent
  // execution while the page incorrectly claims a zero-payout demo. Fail
  // closed on any malformed response rather than converting it to zero.
  const executionCount: unknown = executions.rows.length === 1 ? executions.rows[0]?.n : null;
  if (typeof executionCount !== "number" ||
      !Number.isSafeInteger(executionCount) || executionCount < 0) {
    throw new DemoScenarioError("DEMO_EXECUTION_COUNT_INVALID", 503);
  }

  return {
    findings: observed.rows.map(row => {
      const parsed = invoiceExtractionSchema.safeParse(row.extraction);
      const facts = parsed.success ? parsed.data : null;
      return {
        artifactId: String(row.id),
        sourceShaPrefix: String(row.sha256).slice(0, 16),
        model: compact(row.model) ?? "Unknown",
        provider: compact(row.provider_name),
        requestId: compact(row.gateway_request_id),
        invoiceNumber: compact(facts?.invoice_number.value),
        vendor: compact(facts?.vendor_name.value),
        amount: compact(facts?.total_amount_decimal.value, 48),
        currency: compact(facts?.currency.value, 8),
        reasonCodes: Array.isArray(row.reason_codes)
          ? row.reason_codes.filter((c: unknown): c is string =>
            typeof c === "string" && /^[A-Z][A-Z0-9_]{0,119}$/.test(c)).slice(0, 12)
          : [],
        fieldsSchemaValid: parsed.success,
      };
    }),
    organizationExecutionRows: executionCount,
  };
}
