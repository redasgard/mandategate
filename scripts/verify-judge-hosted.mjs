import assert from "node:assert/strict";

/**
 * Restricted judge-browser HTTP acceptance, never an API payment test.
 * The only POSTs are Better Auth sign-in and sign-out; all business calls are GETs.
 * Run only after owner-approved reviewer provisioning and exact SHA deploy.
 * Post-settlement expectations: the page presents the settled fail-closed state and
 * every replay request is refused with JUDGE_REPLAY_HALTED (no live scenario runs).
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
// Better Auth can set more than one cookie (CSRF, session, etc.) and
// secure hosts may prefix the session cookie with __Secure-. Never send
// a non-session cookie and mistake a failed login for an authorization bug.
const setCookies = login.headers.getSetCookie();
const sessionCookies = setCookies.map(raw => raw.split(";")[0].trim())
  .filter(value =>
    /^(?:__Secure-)?better-auth\.session_token=[^;]+$/.test(value) &&
    !/=$/.test(value));
assert.equal(sessionCookies.length, 1, "JUDGE_SESSION_COOKIE_MISSING_OR_AMBIGUOUS");
const cookie = sessionCookies[0];
const headers = { cookie };
const page = await req("/judge", { headers });
expectedStatus(page, 200, "JUDGE_PAGE");
const html = await page.text();
assert(html.includes("judge-only synthetic sandbox"), "JUDGE_PAGE_CONTENT_MISSING");
assert(html.includes("Model observations, not authorization"), "JUDGE_AI_BOUNDARY_MISSING");
assert(html.includes("Recorded earlier PayPal Sandbox payout"), "JUDGE_HISTORICAL_PAYPAL_MISSING");
// Post-settlement: the demo organization contains the disclosed, reconciled
// payout, so the page must present the settled fail-closed state instead of
// live scenario controls.
assert(html.includes("Replay paused"), "JUDGE_SETTLED_STATE_MISSING");
assert(html.includes("fail-closed after settlement"), "JUDGE_SETTLED_FENCE_MISSING");
console.log("PASS authenticated reviewer-only judge page and separate evidence paths");

const dashboard = await req("/dashboard", { headers });
assert([302, 303, 307, 308].includes(dashboard.status),
  "JUDGE_ADMIN_DASHBOARD_NOT_REDIRECTED");
assert.equal(new URL(dashboard.headers.get("location") ?? "", base).pathname, "/judge",
  "JUDGE_DASHBOARD_REDIRECT_TARGET");
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

// Post-settlement: every replay request must fail closed. The settlement was
// disclosed and reconciled; this fence proves no further demonstration run is
// possible from a judge session, for any case id.
for (const id of ["normal", "anomaly", "substitution", "nonexistent"]) {
  const response = await req("/api/judge/scenario?case=" + id, { headers });
  expectedStatus(response, 409, "JUDGE_CASE_" + id);
  assert((response.headers.get("cache-control") ?? "").includes("no-store"),
    "JUDGE_CACHEABLE_RESPONSE");
  const data = await response.json();
  assert.equal(data.error, "JUDGE_REPLAY_HALTED", "JUDGE_SETTLED_FENCE_" + id);
}
console.log("PASS settled fail-closed replay fence across every judge case");
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
