import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  session: vi.fn(),
  recent: vi.fn(),
  summary: vi.fn(),
}));
vi.mock("../src/db/pool", () => ({ pool: { query: mocks.query } }));
vi.mock("../src/auth/auth", () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error("REDIRECT:" + path); },
}));
vi.mock("../src/db/views", () => ({ listRecentDecisions: mocks.recent }));
vi.mock("../src/db/dashboard-overview", () => ({
  readDashboardSummary: mocks.summary,
}));

import { isRestrictedJudge } from "../src/auth/judge-dashboard";
import DashboardPage from "../app/dashboard/page";

beforeEach(() => {
  mocks.query.mockReset();
  mocks.session.mockReset();
  mocks.recent.mockReset();
  mocks.summary.mockReset();
  mocks.session.mockResolvedValue({ user: { id: "judge-user" } });
  mocks.recent.mockResolvedValue([]);
  mocks.summary.mockResolvedValue({
    pendingReview: 0, denied: 0, payoutUnknown: 0,
    paidThisMonth: [], pendingInvoices: [],
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("judge-only accounts cannot enter the admin dashboard", () => {
  it("requires an active demo REVIEWER without any ADMIN membership", async () => {
    mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
      expect(sql).toContain("role='REVIEWER'");
      expect(sql).toContain("role='ADMIN'");
      expect(sql).toContain("active=true");
      expect(args).toEqual(["judge-user", "org_demo"]);
      return { rows: [{ demo_reviewer: true, any_admin: false }] };
    });
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/judge");
    expect(mocks.recent).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
  });

  it("keeps a real admin on the existing dashboard", async () => {
    mocks.query.mockResolvedValue({ rows: [{ demo_reviewer: true, any_admin: true }] });
    await expect(isRestrictedJudge("judge-user")).resolves.toBe(false);
    const page = await DashboardPage();
    expect(page).toBeDefined();
    expect(mocks.recent).toHaveBeenCalledWith("judge-user");
    expect(mocks.summary).toHaveBeenCalledWith("judge-user");
  });

  it("does not promote or redirect an unrelated reviewer", async () => {
    mocks.query.mockResolvedValue({ rows: [{ demo_reviewer: false, any_admin: false }] });
    await expect(isRestrictedJudge("judge-user")).resolves.toBe(false);
  });

  it("fails closed if a role-read result is malformed", async () => {
    for (const rows of [[], [{ demo_reviewer: "true", any_admin: false }], [
      { demo_reviewer: true, any_admin: false },
      { demo_reviewer: false, any_admin: true },
    ]]) {
      mocks.query.mockResolvedValueOnce({ rows });
      await expect(isRestrictedJudge("judge-user"))
        .rejects.toThrow("JUDGE_DASHBOARD_ROLE_READ_FAILED");
    }
    expect(mocks.recent).not.toHaveBeenCalled();
  });
});
