import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/db/pool", () => ({ pool: { query: mocks.query } }));
import { readJudgeCanonicalDecisions } from "../src/demo/judge-readonly";
import { DEMO_CASES, DEMO_ORG_ID } from "../src/demo/scenarios";

const record = (id: "normal" | "anomaly" | "substitution") => {
  const item = DEMO_CASES.find(x => x.id === id)!;
  return {
    id: "fictional-uuid-" + id,
    idempotency_key: "mandategate-p0-synthetic-20261015-" + id + "-v1",
    invoice_number: item.invoiceNumber,
    source: "demo_fixture",
    status: item.expectedOutcome === "ALLOW" ? "ALLOWED" :
      item.expectedOutcome === "DENY" ? "DENIED" : "ESCALATED",
    outcome: item.expectedOutcome,
    reason_codes: [item.expectedOutcome === "ALLOW" ? "WITHIN_TRUSTED_BASELINE" :
      item.expectedOutcome === "DENY" ? "DESTINATION_MISMATCH" :
        "AMOUNT_OUTSIDE_VENDOR_BASELINE"],
    has_execution: false,
  };
};
const normal = record("normal");
const anomaly = record("anomaly");
const substitution = record("substitution");

beforeEach(() => {
  vi.stubEnv("MANDATEGATE_RUNTIME_MODE", "neon-preview");
  vi.stubEnv("MANDATEGATE_DISABLE_PAYMENTS", "1");
  vi.stubEnv("DATABASE_URL",
    "postgresql://fixture:fixture@ep-silent-poetry-arjowm4d-pooler.c-4.us-west-2.aws.neon.tech/neondb");
  mocks.query.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("persisted, source-separated judge canonical evidence", () => {
  it("reads only exact demo keys for the active reviewer in one read-only tenant query", async () => {
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      expect(sql.trimStart().toLowerCase()).toMatch(/^select /);
      expect(sql).toContain("pr.organization_id=$1");
      expect(sql).toContain("pr.idempotency_key=any($3::text[])");
      expect(sql).toContain("m.user_id=$2");
      expect(sql).toContain("m.role='REVIEWER' and m.active=true");
      expect(sql).toContain("elevated.role='ADMIN'");
      expect(sql).toContain("join payment_decisions");
      expect(sql).toContain("payment_executions");
      expect(params).toEqual([DEMO_ORG_ID, "judge-user",
        DEMO_CASES.map(item => "mandategate-p0-synthetic-20261015-" + item.id + "-v1")]);
      return { rows: [normal, anomaly, substitution] };
    });
    const actual = await readJudgeCanonicalDecisions("judge-user");
    expect(actual.map(x => x.outcome)).toEqual(["ALLOW", "ESCALATE", "DENY"]);
    expect(actual.map(x => x.requestId)).toEqual(
      [normal.id, anomaly.id, substitution.id]);
    expect(actual.every(x =>
      x.hasExecution === false &&
      x.proofClass === "PERSISTED_SYNTHETIC_CANONICAL_DECISION")).toBe(true);
  });

  it("labels missing saved cases as missing, not successful decisions", async () => {
    mocks.query.mockResolvedValue({ rows: [normal] });
    const result = await readJudgeCanonicalDecisions("judge-user");
    expect(result.map(x => x.outcome)).toEqual(["ALLOW", null, null]);
    expect(result[1].requestId).toBeNull();
  });

  it("fails closed on forged source, duplicate row or payout", async () => {
    for (const changed of [
      [{...normal, source:"agent_api"}],
      [{...normal, has_execution:true}],
      [normal,normal],
      [{...normal, status:"PAID"}],
      [{...normal, outcome:"DENY"}],
      [{...normal, reason_codes:["valid", "WITHIN_TRUSTED_BASELINE"]}],
      [{...normal, invoice_number:"FORGED-INVOICE"}],
    ]) {
      mocks.query.mockResolvedValueOnce({ rows: changed });
      await expect(readJudgeCanonicalDecisions("judge-user"))
        .rejects.toMatchObject({ code: expect.stringMatching(/^JUDGE_CANONICAL_LEDGER_/), httpStatus: 503 });
    }
  });

  it("does not read any organization when payment-disabled preview is off", async () => {
    vi.stubEnv("MANDATEGATE_DISABLE_PAYMENTS", "0");
    await expect(readJudgeCanonicalDecisions("judge-user"))
      .rejects.toMatchObject({ code: "JUDGE_DEMO_DISABLED", httpStatus: 404 });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
