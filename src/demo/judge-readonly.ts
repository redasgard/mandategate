import { pool } from "@/src/db/pool";
import { invoiceExtractionSchema } from "@/src/invoices/schema";
import { evaluatePayment } from "@/src/policy/decision";
import {
  DEMO_CASES, DEMO_ORG_ID, DEMO_TRUSTED_DESTINATION, demoPreviewEnabled,
} from "./scenarios";

export class JudgeDemoError extends Error {
  constructor(public readonly code: string, public readonly httpStatus = 404) {
    super(code);
    this.name = "JudgeDemoError";
  }
}

export async function requireJudgeReadAccess(userId: string): Promise<void> {
  // A judge account is not an ADMIN. Its only app capability is this isolated
  // payments-disabled preview, scoped to the single synthetic organization.
  if (!demoPreviewEnabled(process.env)) throw new JudgeDemoError("JUDGE_DEMO_DISABLED", 404);
  const membership = await pool.query([
    "select 1 from organization_admin_memberships m",
    "where m.organization_id=$1 and m.user_id=$2",
    "and m.role='REVIEWER' and m.active=true",
    "and not exists (select 1 from organization_admin_memberships elevated",
    "where elevated.user_id=m.user_id and elevated.role='ADMIN'",
    "and elevated.active=true)",
    "limit 1",
  ].join(" "), [DEMO_ORG_ID, userId]);
  if (membership.rows.length !== 1) throw new JudgeDemoError("JUDGE_ACCESS_NOT_GRANTED", 404);
}

const safe = (value: unknown, limit = 80): string | null =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, limit) : null;

export type JudgeModelEvidence = {
  artifactId: string;
  sourceShaPrefix: string;
  model: string;
  vendor: string | null;
  invoiceNumber: string | null;
  amount: string | null;
  currency: string | null;
  reasonCodes: string[];
};

function strictExecutionCount(rows: Record<string, unknown>[]) {
  const value: unknown = rows.length === 1 ? rows[0]?.n : null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new JudgeDemoError("JUDGE_EXECUTION_COUNT_UNAVAILABLE", 503);
  return value;
}

/** Financial activity always blocks the judge replay, regardless of source. */
export async function readJudgeExecutionCount(userId: string): Promise<number> {
  if (!demoPreviewEnabled(process.env)) throw new JudgeDemoError("JUDGE_DEMO_DISABLED", 404);
  // One PostgreSQL statement/snapshot binds the zero-execution count to
  // CURRENT reviewer authorization. An aggregate with WHERE EXISTS could
  // return zero when membership is revoked, which is not authorization.
  const result = await pool.query([
    "select (select count(*)::int from payment_executions e",
    "join payment_requests pr on pr.id=e.payment_request_id",
    "where pr.organization_id=$1) as n,",
    "exists (select 1 from organization_admin_memberships m",
    "where m.organization_id=$1 and m.user_id=$2",
    "and m.role='REVIEWER' and m.active=true",
    "and not exists (select 1 from organization_admin_memberships elevated",
    "where elevated.user_id=m.user_id and elevated.role='ADMIN'",
    "and elevated.active=true)) as reviewer_authorized",
  ].join(" "), [DEMO_ORG_ID, userId]);
  const valid = result.rows.length === 1 ? result.rows[0]?.reviewer_authorized : null;
  if (valid === false) throw new JudgeDemoError("JUDGE_ACCESS_NOT_GRANTED", 404);
  if (valid !== true) throw new JudgeDemoError("JUDGE_EXECUTION_COUNT_UNAVAILABLE", 503);
  return strictExecutionCount(result.rows);
}

/** Only owner-reviewed, exact original SHA fixtures may enter the judge page. */
export function judgeApprovedSourceShas(env: Record<string, string | undefined>): string[] {
  const raw = env.JUDGE_SYNTHETIC_SOURCE_SHAS?.trim();
  if (!raw) return []; // No implicit publication of consent-labeled files.
  const hashes = raw.split(",").map(value => value.trim());
  if (hashes.length > 3 || hashes.some(value => !/^[a-f0-9]{64}$/.test(value)) ||
      new Set(hashes).size !== hashes.length) {
    throw new JudgeDemoError("JUDGE_SOURCE_ALLOWLIST_INVALID", 503);
  }
  return hashes;
}

/** Read-only, consent-bound and separately allowlisted model hints. */
export async function readJudgeModelEvidence(userId: string): Promise<JudgeModelEvidence[]> {
  await requireJudgeReadAccess(userId);
  const allowed = judgeApprovedSourceShas(process.env);
  if (allowed.length === 0) return [];
  const result = await pool.query([
    "select a.id,a.sha256,o.model,o.extraction,o.reason_codes",
    "from invoice_image_observations o",
    "join invoice_artifacts a on a.id=o.artifact_id",
    "and a.organization_id=o.organization_id and o.input_sha256=a.sha256",
    "where o.organization_id=$1 and o.state='ESCALATE' and o.error_code is null",
    "and a.sha256=any($3::text[])",
    "and o.reason_codes @> '[\"SYNTHETIC_NON_ZDR_TEST_ONLY\"]'::jsonb",
    "and exists (select 1 from invoice_synthetic_non_zdr_test_consents c",
    "where c.organization_id=a.organization_id and c.artifact_id=a.id",
    "and c.source_sha256=a.sha256)",
    "and exists (select 1 from organization_admin_memberships m",
    "where m.organization_id=o.organization_id and m.user_id=$2",
    "and m.role='REVIEWER' and m.active=true",
    "and not exists (select 1 from organization_admin_memberships elevated",
    "where elevated.user_id=m.user_id and elevated.role='ADMIN'",
    "and elevated.active=true))",
    "order by o.finished_at desc,a.id desc limit 3",
  ].join(" "), [DEMO_ORG_ID, userId, allowed]);
  return result.rows.map(row => {
    const parsed = invoiceExtractionSchema.safeParse(row.extraction);
    const values = parsed.success ? parsed.data : null;
    return {
      artifactId: String(row.id),
      sourceShaPrefix: String(row.sha256).slice(0, 16),
      model: safe(row.model) ?? "Unknown",
      vendor: safe(values?.vendor_name.value),
      invoiceNumber: safe(values?.invoice_number.value),
      amount: safe(values?.total_amount_decimal.value, 48),
      currency: safe(values?.currency.value, 8),
      reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes.filter(
        (code: unknown): code is string =>
          typeof code === "string" && /^[A-Z][A-Z0-9_]{0,119}$/.test(code),
      ).slice(0, 12) : [],
    };
  });
}

/**
 * The saved three-case decision ledger is independent from the button-driven
 * simulation. Only exact, canonical, explicitly fictional requests are shown.
 * Neither GLM hints nor this ledger confer invoice/payment authorization.
 */
export type JudgeCanonicalDecision = {
  id: string;
  requestId: string | null;
  invoiceNumber: string;
  status: string | null;
  outcome: "ALLOW" | "ESCALATE" | "DENY" | null;
  reasonCodes: string[];
  hasExecution: false;
  proofClass: "PERSISTED_SYNTHETIC_CANONICAL_DECISION";
};

export async function readJudgeCanonicalDecisions(userId: string): Promise<JudgeCanonicalDecision[]> {
  if (!demoPreviewEnabled(process.env)) throw new JudgeDemoError("JUDGE_DEMO_DISABLED", 404);
  const keys = DEMO_CASES.map(item =>
    "mandategate-p0-synthetic-20261015-" + item.id + "-v1");
  const result = await pool.query([
    "select pr.id,pr.idempotency_key,pr.invoice_number,pr.source,pr.status,",
    "pd.outcome,pd.reason_codes,(pe.id is not null) as has_execution",
    "from payment_requests pr",
    "join payment_decisions pd on pd.payment_request_id=pr.id",
    "left join payment_executions pe on pe.payment_request_id=pr.id",
    "where pr.organization_id=$1 and pr.idempotency_key=any($3::text[])",
    "and exists (select 1 from organization_admin_memberships m",
    "where m.organization_id=pr.organization_id and m.user_id=$2",
    "and m.role='REVIEWER' and m.active=true",
    "and not exists (select 1 from organization_admin_memberships elevated",
    "where elevated.user_id=m.user_id and elevated.role='ADMIN'",
    "and elevated.active=true))",
  ].join(" "), [DEMO_ORG_ID, userId, keys]);

  const seen = new Map<string, Record<string, unknown>>();
  for (const row of result.rows) {
    const key = row.idempotency_key;
    if (typeof key !== "string" || !keys.includes(key) || seen.has(key) ||
        row.source !== "demo_fixture" || row.has_execution !== false ||
        !["ALLOW", "ESCALATE", "DENY"].includes(row.outcome) ||
        !["ALLOWED", "ESCALATED", "DENIED"].includes(row.status) ||
        !Array.isArray(row.reason_codes) || !row.reason_codes.every(
          (reason: unknown) => typeof reason === "string" &&
          /^[A-Z][A-Z0-9_]{0,119}$/.test(reason))) {
      throw new JudgeDemoError("JUDGE_CANONICAL_LEDGER_INVALID", 503);
    }
    seen.set(key, row);
  }
  return DEMO_CASES.map(item => {
    const key = "mandategate-p0-synthetic-20261015-" + item.id + "-v1";
    const row = seen.get(key);
    if (row && (row.outcome !== item.expectedOutcome ||
        row.invoice_number !== item.invoiceNumber ||
        row.status !== (
          item.expectedOutcome === "ALLOW" ? "ALLOWED" :
          item.expectedOutcome === "DENY" ? "DENIED" : "ESCALATED"
        ))) {
      throw new JudgeDemoError("JUDGE_CANONICAL_LEDGER_CHANGED", 503);
    }
    return {
      id: item.id,
      invoiceNumber: item.invoiceNumber,
      requestId: row ? String(row.id) : null,
      status: row ? String(row.status) : null,
      outcome: row ? row.outcome as "ALLOW" | "ESCALATE" | "DENY" : null,
      reasonCodes: row ? row.reason_codes as string[] : [],
      hasExecution: false as const,
      proofClass: "PERSISTED_SYNTHETIC_CANONICAL_DECISION" as const,
    };
  });
}

export const JUDGE_SCENARIO_IDS = DEMO_CASES.map(item => item.id);

export function evaluateJudgeCase(caseId: string) {
  const scenario = DEMO_CASES.find(item => item.id === caseId);
  if (!scenario) throw new JudgeDemoError("JUDGE_CASE_NOT_FOUND", 404);
  // Fixed trusted inputs, never querystring-supplied payees or amounts.
  const requestedDestination = scenario.id === "substitution"
    ? "changed-payee@synthetic.invalid" : DEMO_TRUSTED_DESTINATION;
  const decision = evaluatePayment({
    amountCents: scenario.amountCents,
    currency: "USD",
    requestedDestination,
    trustedDestination: DEMO_TRUSTED_DESTINATION,
    vendorNormalMaxAmountCents: 250000,
    policyAutoPayMaxAmountCents: 300000,
  });
  return {
    id: scenario.id,
    title: scenario.title,
    invoiceNumber: scenario.invoiceNumber,
    amountCents: scenario.amountCents,
    outcome: decision.outcome,
    reasonCodes: decision.reasonCodes,
    expectedOutcome: scenario.expectedOutcome,
    trustedDestinationChanged: requestedDestination !== DEMO_TRUSTED_DESTINATION,
    proofClass: "DETERMINISTIC_POLICY_SIMULATION" as const,
    noPaymentPerformed: true as const,
    noPaymentStateMutation: true as const,
    aiInvoiceDerived: false as const,
  };
}
