import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  loadArtifact: vi.fn(),
  analyze: vi.fn(),
  query: vi.fn(),
}));
vi.mock("../src/db/pool", () => ({ pool: { query: mocks.query } }));
vi.mock("../src/auth/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("../src/artifacts/postgres-store", () => ({
  loadInvoiceArtifactForHumanReview: mocks.loadArtifact,
}));
vi.mock("../src/invoices/image-analysis", () => ({
  analyzeStoredInvoiceImage: mocks.analyze,
  InvoiceImageAnalysisError: class InvoiceImageAnalysisError extends Error {
    constructor(public code: string, public httpStatus: number) {
      super(code);
    }
  },
}));

import { POST } from "../app/api/admin/invoice-artifacts/[id]/observe-synthetic/route";

const sha = "892d7889152b6d6e6d20310f3b7a59cf25e7c3b73ea5882d9c30de781c3ce181";
const artifactId = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: artifactId }) };
const origin = "http://127.0.0.1:3000";
const url = origin + "/api/admin/invoice-artifacts/" + artifactId + "/observe-synthetic";
const consent = {
  expectedArtifactSha256: sha,
  syntheticFixtureOnly: true,
  acknowledgeProviderRetentionRisk: true,
};
function req(body: unknown = consent, requestedOrigin = origin) {
  return new Request(url, {
    method: "POST",
    headers: { origin: requestedOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("MANDATEGATE_DEPLOYMENT_ROLE", "demo");
  vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_TEST", "1");
  vi.stubEnv("PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com");
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("RENDER_SERVICE_ID", "");
  vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST", sha);
  mocks.getSession.mockResolvedValue({ user: { id: "synthetic-admin" } });
  mocks.loadArtifact.mockResolvedValue({
    sha256: sha, organizationId: "org_demo", mimeType: "application/pdf",
  });
  mocks.query.mockResolvedValue({ rows: [{ id: "22222222-2222-4222-8222-222222222222" }] });
  mocks.analyze.mockResolvedValue({
    status: "ESCALATE",
    reasonCodes: ["SYNTHETIC_NON_ZDR_TEST_ONLY"],
    evidence: { zdr: false, syntheticNonZdrTest: true },
    paymentAuthorized: false,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("admin-only synthetic non-ZDR endpoint", () => {
  it("is absent without an explicit server-side demo flag", async () => {
    vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_TEST", "0");
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("SYNTHETIC_NON_ZDR_TEST_DISABLED");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it("refuses cross-site requests before checking the session", async () => {
    const res = await POST(req(consent, "https://attacker.example"), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("INVALID_ORIGIN");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it("refuses unsigned requests", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(401);
    expect(mocks.loadArtifact).not.toHaveBeenCalled();
  });
  it("refuses artifacts outside the authenticated admin's organization", async () => {
    mocks.loadArtifact.mockResolvedValueOnce(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("refuses an unallowlisted source hash before inference", async () => {
    vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST", "0".repeat(64));
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("SYNTHETIC_NON_ZDR_TEST_NOT_ALLOWED");
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("requires affirmative retention consent and a byte-exact source digest", async () => {
    for (const body of [
      { ...consent, acknowledgeProviderRetentionRisk: false },
      { ...consent, syntheticFixtureOnly: false },
      { ...consent, extra: "injected" },
    ]) {
      const res = await POST(req(body), params);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("SYNTHETIC_TEST_ACK_REQUIRED");
    }
    const stale = await POST(req({ ...consent, expectedArtifactSha256: "0".repeat(64) }), params);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toBe("SYNTHETIC_TEST_SOURCE_MISMATCH");
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("does not invoke inference when the admin membership is revoked before consent persistence", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("SYNTHETIC_TEST_ADMIN_ACCESS_REVOKED");
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("does not invoke inference if the append-only consent audit cannot be written", async () => {
    mocks.query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(POST(req(), params)).rejects.toThrow("database unavailable");
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("passes only a verified admin-owned synthetic source to the advisory analyzer", async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const result = await res.json();
    expect(result).toMatchObject({
      privacyMode: "SYNTHETIC_NON_ZDR_TEST",
      sourceTrust: "MODEL_OBSERVATION_UNTRUSTED",
      issuerAuthenticated: false,
      paymentAuthorized: false,
      paymentExecuted: false,
      observation: {
        status: "ESCALATE",
        evidence: { zdr: false, syntheticNonZdrTest: true },
      },
    });
    expect(result.consentId).toBe("22222222-2222-4222-8222-222222222222");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.analyze.mock.invocationCallOrder[0]);
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    expect(mocks.analyze).toHaveBeenCalledWith(
      "org_demo", artifactId, undefined, { syntheticNonZdrTest: true },
    );
  });
});
