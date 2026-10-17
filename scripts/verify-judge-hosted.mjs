import assert from "node:assert/strict";

/**
 * Restricted judge-browser HTTP acceptance, never an API payment test.
 * The only POSTs are Better Auth sign-in and sign-out; all business calls are GETs.
 * Run only after owner-approved reviewer provisioning and exact SHA deploy.
 */
if (process.env.JUDGE_SMOKE_APPROVED !== "YES")
  throw new Error("JUDGE_SMOKE_OPERATOR_APPROVAL_REQUIRED");
const base = process.env.JUDGE_DEMO_BASE_URL ?? "https://mandategate-web.onrender.com";
const email = process.env.JUDGE_DEMO_EMAIL;
const password = process.env.JUDGE_DEMO_PASSWORD;
const target = new URL(base);
const local = target.protocol === "http:" &&
  ["localhost", "127.0.0.1"].includes(target.hostname);
assert(
  base === "https://mandategate-web.onrender.com" ||
    (local && !target.username && !target.password && target.pathname === "/" &&
     !target.search && !target.hash && !base.endsWith("/")),
  "JUDGE_BASE_URL_NOT_ALLOWLISTED",
);
assert(email && password && password.length >= 24, "JUDGE_TEST_CREDENTIALS_REQUIRED");

const req = (path, options = {}) => fetch(base + path, {
  ...options, redirect: "manual", cache: "no-store",
  signal: AbortSignal.timeout(20000),
});
function expectedStatus(actual, expected, code) {
  assert.equal(actual.status, expected, code);
}
const health = await req("/api/health");
expectedStatus(health, 200, "JUDGE_HEALTH");
const healthBody = await health.json();
assert.equal(healthBody.ok, true, "JUDGE_HEALTH_NOT_READY");
const anon = await req("/judge");
assert([302, 303, 307, 308].includes(anon.status), "JUDGE_ANON_VISIBLE");
assert((anon.headers.get("location") ?? "").includes("/sign-in"), "JUDGE_SIGNIN_REDIRECT");
console.log("PASS anonymous restricted page and health");

const login = await req("/api/auth/sign-in/email", {
  method: "POST",
  headers: { origin: base, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
expectedStatus(login, 200, "JUDGE_SIGNIN");
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert(cookie && cookie.includes("="), "JUDGE_SESSION_COOKIE_MISSING");
const headers = { cookie };
const page = await req("/judge", { headers });
expectedStatus(page, 200, "JUDGE_PAGE");
const html = await page.text();
assert(html.includes("judge-only synthetic sandbox"), "JUDGE_PAGE_CONTENT_MISSING");
assert(html.includes("Model observations, not authorization"), "JUDGE_AI_BOUNDARY_MISSING");
assert(html.includes("Recorded earlier PayPal Sandbox payout"), "JUDGE_HISTORICAL_PAYPAL_MISSING");
assert(!html.includes("Replay halted:"), "JUDGE_PAYMENT_EXECUTIONS_PRESENT");
console.log("PASS authenticated reviewer-only judge page and separate evidence paths");

const adminDemo = await req("/demo", { headers });
expectedStatus(adminDemo, 404, "JUDGE_ADMIN_DEMO_LEAK");
const privacy = await req("/api/admin/experiential-privacy", { headers });
expectedStatus(privacy, 403, "JUDGE_ADMIN_PRIVACY_LEAK");
const probeArtifact = process.env.JUDGE_PROBE_ARTIFACT_ID;
if (probeArtifact) {
  assert(/^[a-f0-9-]{36}$/i.test(probeArtifact), "JUDGE_PROBE_ARTIFACT_INVALID");
  expectedStatus(await req("/api/admin/invoice-artifacts/" +
    encodeURIComponent(probeArtifact) + "/source", { headers }),
    404, "JUDGE_ORIGINAL_DOCUMENT_LEAK");
}
const probePayment = process.env.JUDGE_PROBE_PAYMENT_ID;
if (probePayment) {
  assert(/^[a-f0-9-]{36}$/i.test(probePayment), "JUDGE_PROBE_PAYMENT_INVALID");
  expectedStatus(await req("/payments/" + encodeURIComponent(probePayment), { headers }),
    404, "JUDGE_ADMIN_PAYMENT_DETAIL_LEAK");
}
console.log("PASS reviewer denied access to selected ADMIN routes");

const cases = [
  ["normal", "ALLOW", "WITHIN_TRUSTED_BASELINE"],
  ["anomaly", "ESCALATE", "AMOUNT_OUTSIDE_VENDOR_BASELINE"],
  ["substitution", "DENY", "DESTINATION_MISMATCH"],
];
for (let pass = 1; pass <= 2; pass++) {
  for (const [id, outcome, reason] of cases) {
    const response = await req("/api/judge/scenario?case=" + id, { headers });
    expectedStatus(response, 200, "JUDGE_CASE_" + id);
    assert((response.headers.get("cache-control") ?? "").includes("no-store"),
      "JUDGE_CACHEABLE_DECISION");
    const data = await response.json();
    assert.equal(data.id, id);
    assert.equal(data.outcome, outcome);
    assert(data.reasonCodes.includes(reason), "JUDGE_REASON_MISSING_" + id);
    assert.equal(data.proofClass, "DETERMINISTIC_POLICY_SIMULATION");
    assert.equal(data.noPaymentPerformed, true);
    assert.equal(data.noPaymentStateMutation, true);
    assert.equal(data.aiInvoiceDerived, false);
  }
}
const unknown = await req("/api/judge/scenario?case=nonexistent", { headers });
expectedStatus(unknown, 404, "JUDGE_UNKNOWN_CASE_MUST_NOT_EXECUTE");
console.log("PASS six deterministic, read-only policy evaluations and invalid-case denial");
const signout = await req("/api/auth/sign-out", {
  method: "POST",
  headers: { ...headers, origin: base, "content-type": "application/json" },
  body: "{}",
});
expectedStatus(signout, 200, "JUDGE_SIGNOUT");
const after = await req("/judge", { headers });
assert([302, 303, 307, 308].includes(after.status), "JUDGE_STALE_SESSION_ACCEPTED");
const afterApi = await req("/api/judge/scenario?case=normal", { headers });
expectedStatus(afterApi, 401, "JUDGE_SIGNOUT_API_STILL_AUTHENTICATED");
console.log("PASS revoked judge session cannot access page or evaluation API");
console.log("JUDGE_SMOKE_READONLY_PASS (not full CI, external payout verification, or DB restore)");
