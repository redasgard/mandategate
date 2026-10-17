import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), executions: vi.fn(), scenario: vi.fn(),
}));
vi.mock("../src/auth/auth", () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock("../src/demo/scenarios", () => ({ demoPreviewEnabled: () => true }));
vi.mock("../src/demo/judge-readonly", () => ({
  JudgeDemoError: class JudgeDemoError extends Error {
    constructor(public code: string, public httpStatus = 404) {
      super(code);
    }
  },
  readJudgeExecutionCount: mocks.executions,
  evaluateJudgeCase: mocks.scenario,
}));
import { GET } from "../app/api/judge/scenario/route";

const request = (id: string) =>
  new Request("http://localhost:3000/api/judge/scenario?case=" + encodeURIComponent(id));

beforeEach(() => {
  mocks.session.mockReset();
  mocks.executions.mockReset();
  mocks.scenario.mockReset();
  mocks.session.mockResolvedValue({ user: { id: "judge-user" } });
  mocks.executions.mockResolvedValue(0);
  mocks.scenario.mockReturnValue({
    id: "normal", outcome: "ALLOW", reasonCodes: ["WITHIN_TRUSTED_BASELINE"],
    proofClass: "DETERMINISTIC_POLICY_SIMULATION",
    noPaymentPerformed: true, noPaymentStateMutation: true, aiInvoiceDerived: false,
  });
});

describe("signed-in judge GET endpoint", () => {
  it("rejects anonymous access before any tenant or policy lookup", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(request("normal"));
    expect(response.status).toBe(401);
    expect(mocks.executions).not.toHaveBeenCalled();
    expect(mocks.scenario).not.toHaveBeenCalled();
  });

  it("blocks replay if any demo organization payment execution exists", async () => {
    mocks.executions.mockResolvedValue(1);
    const response = await GET(request("normal"));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("JUDGE_REPLAY_HALTED");
    expect(mocks.scenario).not.toHaveBeenCalled();
  });

  it("responds with read-only server policy result and never caches it", async () => {
    const response = await GET(request("normal"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      outcome: "ALLOW", noPaymentPerformed: true, noPaymentStateMutation: true,
      aiInvoiceDerived: false,
    });
    expect(mocks.executions).toHaveBeenCalledWith("judge-user");
    expect(mocks.scenario).toHaveBeenCalledWith("normal");
  });
});
