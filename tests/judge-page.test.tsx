import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), evidence: vi.fn(), count: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error("REDIRECT:" + path); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("../src/auth/auth", () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock("../src/demo/scenarios", () => ({
  demoPreviewEnabled: () => true,
  DEMO_CASES: [
    { id: "normal", title: "Normal invoice", expectedOutcome: "ALLOW" },
    { id: "anomaly", title: "Unusual amount", expectedOutcome: "ESCALATE" },
    { id: "substitution", title: "Changed payee", expectedOutcome: "DENY" },
  ],
}));
vi.mock("../src/demo/judge-readonly", () => ({
  JudgeDemoError: class JudgeDemoError extends Error {
    constructor(public readonly httpStatus = 404) { super("JUDGE_DENIED"); }
  },
  readJudgeExecutionCount: mocks.count,
  readJudgeModelEvidence: mocks.evidence,
}));
vi.mock("../app/judge/replay-cases", () => ({
  JudgeScenarioReplay: () => "JUDGE_READONLY_REPLAY",
}));
vi.mock("../app/demo/historical-sandbox-proof", () => ({
  HistoricalSandboxProof: () => "ARCHIVED_PAYPAL_SEPARATE_FROM_GLM",
}));

import JudgePage from "../app/judge/page";
const render = async () => renderToStaticMarkup(await JudgePage());

beforeEach(() => {
  mocks.session.mockReset();
  mocks.evidence.mockReset();
  mocks.count.mockReset();
  mocks.session.mockResolvedValue({ user: { id: "judge-user" } });
  mocks.evidence.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});

describe("read-only signed-in judge presentation", () => {
  it("requires an authenticated session", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("REDIRECT:/sign-in");
    expect(mocks.evidence).not.toHaveBeenCalled();
  });

  it("keeps real AI and historical PayPal evidence separate", async () => {
    const html = await render();
    expect(html).toContain("JUDGE_READONLY_REPLAY");
    expect(html).toContain("ARCHIVED_PAYPAL_SEPARATE_FROM_GLM");
    expect(html).toContain("consented fictional input");
    expect(html).toContain("not independently verified");
    expect(html).not.toContain("Run PayPal payout");
    expect(mocks.evidence).toHaveBeenCalledWith("judge-user");
    expect(mocks.count).toHaveBeenCalledWith("judge-user");
  });

  it("removes all scenario controls if any execution row exists", async () => {
    mocks.count.mockResolvedValue(1);
    const html = await render();
    expect(html).toContain("Replay halted");
    expect(html).not.toContain("JUDGE_READONLY_REPLAY");
  });
});
