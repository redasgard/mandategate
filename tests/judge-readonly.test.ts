import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/db/pool", () => ({ pool: { query: mocks.query } }));

import {
  evaluateJudgeCase, judgeApprovedSourceShas, readJudgeExecutionCount,
  readJudgeModelEvidence, requireJudgeReadAccess,
} from "../src/demo/judge-readonly";

beforeEach(() => {
  vi.stubEnv("MANDATEGATE_RUNTIME_MODE", "neon-preview");
  vi.stubEnv("MANDATEGATE_DISABLE_PAYMENTS", "1");
  vi.stubEnv("DATABASE_URL",
    "postgresql://ci:ci@ep-silent-poetry-arjowm4d-pooler.c-4.us-west-2.aws.neon.tech/neondb");
  vi.stubEnv("JUDGE_SYNTHETIC_SOURCE_SHAS", "");
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
    const q = sql.trim().toLowerCase();
    expect(q.startsWith("select")).toBe(true); // Never mutate shared DB.
    if (q.startsWith("select 1 from organization_admin_memberships")) {
      expect(sql).toContain("role='REVIEWER' and active=true");
      expect(args).toEqual(["org_demo", "judge-user"]);
      return { rows: [{ ok: 1 }] };
    }
    if (sql.includes("from payment_executions")) {
      expect(sql).toContain("where pr.organization_id=$1");
      expect(sql).toContain("role='REVIEWER' and m.active=true");
      expect(args).toEqual(["org_demo", "judge-user"]);
      return { rows: [{ n: 0 }] };
    }
    if (sql.includes("from invoice_image_observations")) {
      expect(sql).toContain("a.sha256=any($3::text[])");
      expect(sql).toContain("invoice_synthetic_non_zdr_test_consents");
      expect(sql).toContain("role='REVIEWER' and m.active=true");
      expect(args).toEqual(["org_demo", "judge-user", ["a".repeat(64)]]);
      return { rows: [{
        id: "fictional-artifact", sha256: "a".repeat(64), model: "glm-5.3-flash",
        extraction: null, reason_codes: ["SYNTHETIC_NON_ZDR_TEST_ONLY"],
      }] };
    }
    throw new Error("UNEXPECTED_QUERY:" + sql);
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("restricted judge replay with no payment authority", () => {
  it("requires payment-disabled fixed Neon preview and current REVIEWER membership", async () => {
    await expect(requireJudgeReadAccess("judge-user")).resolves.toBeUndefined();
    vi.stubEnv("MANDATEGATE_DISABLE_PAYMENTS", "0");
    await expect(requireJudgeReadAccess("judge-user"))
      .rejects.toMatchObject({ code: "JUDGE_DEMO_DISABLED" });
    vi.stubEnv("MANDATEGATE_DISABLE_PAYMENTS", "1");
    mocks.query.mockResolvedValueOnce({ rows: [] });
    await expect(requireJudgeReadAccess("judge-user"))
      .rejects.toMatchObject({ code: "JUDGE_ACCESS_NOT_GRANTED" });
  });

  it("evaluates fixed scenarios in the actual policy kernel without I/O", () => {
    expect(["normal", "anomaly", "substitution"].map(id =>
      evaluateJudgeCase(id).outcome)).toEqual(["ALLOW", "ESCALATE", "DENY"]);
    expect(evaluateJudgeCase("substitution").reasonCodes)
      .toContain("DESTINATION_MISMATCH");
    expect(evaluateJudgeCase("normal")).toMatchObject({
      noPaymentPerformed: true, noDatabaseMutation: true,
      aiInvoiceDerived: false, proofClass: "DETERMINISTIC_POLICY_SIMULATION",
    });
    expect(() => evaluateJudgeCase("outside-allowlist"))
      .toThrow("JUDGE_CASE_NOT_FOUND");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("never publishes consent-only model observations by default", async () => {
    expect(await readJudgeModelEvidence("judge-user")).toEqual([]);
    expect(mocks.query).toHaveBeenCalledTimes(1); // membership, no model query
  });

  it("requires validated, distinct SHA-256 source allowlist", () => {
    expect(judgeApprovedSourceShas({})).toEqual([]);
    expect(judgeApprovedSourceShas({ JUDGE_SYNTHETIC_SOURCE_SHAS: "a".repeat(64) }))
      .toEqual(["a".repeat(64)]);
    for (const bad of ["bad", "a".repeat(64)+","+"a".repeat(64),
      Array(4).fill("b".repeat(64)).join(",")]) {
      expect(() => judgeApprovedSourceShas({ JUDGE_SYNTHETIC_SOURCE_SHAS: bad }))
        .toThrow("JUDGE_SOURCE_ALLOWLIST_INVALID");
    }
  });

  it("binds model evidence to approved source, consent and reviewer tenant", async () => {
    vi.stubEnv("JUDGE_SYNTHETIC_SOURCE_SHAS", "a".repeat(64));
    const evidence = await readJudgeModelEvidence("judge-user");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      sourceShaPrefix: "a".repeat(16),
      model: "glm-5.3-flash",
      reasonCodes: ["SYNTHETIC_NON_ZDR_TEST_ONLY"],
    });
  });

  it("checks all demo-org payment sources and fails closed on unavailable count", async () => {
    expect(await readJudgeExecutionCount("judge-user")).toBe(0);
    mocks.query.mockImplementationOnce(async () => ({rows:[{ok:1}]}))
      .mockImplementationOnce(async () => ({rows:[{n:"0"}]}));
    await expect(readJudgeExecutionCount("judge-user"))
      .rejects.toMatchObject({ code:"JUDGE_EXECUTION_COUNT_UNAVAILABLE", httpStatus:503 });
  });
});
