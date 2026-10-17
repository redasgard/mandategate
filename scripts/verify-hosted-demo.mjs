import assert from "node:assert/strict";

const base = "https://mandategate-web.onrender.com";
const password = process.env.DEMO_ADMIN_PASSWORD;
assert(password && password.length >= 12, "HOSTED_DEMO_ADMIN_SECRET_MISSING");

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options, redirect:"manual", signal:AbortSignal.timeout(20000),
  });
  return response;
}
function assertHttp(r, expected, label) {
  assert.equal(r.status, expected, label + "_HTTP_STATUS");
}
const health = await request("/api/health");
assertHttp(health, 200, "HOSTED_HEALTH");
const healthData = await health.json();
assert(healthData.ok === true && healthData.database === "ready", "HOSTED_DATABASE_NOT_READY");
console.log("PASS hosted app health and database");

const anonymous = await request("/demo");
assert([302,303,307,308].includes(anonymous.status), "DEMO_ANONYMOUS_ACCESS");
const location = anonymous.headers.get("location") ?? "";
assert(location.includes("/sign-in"), "DEMO_ANONYMOUS_NOT_REDIRECTED");
const webhook = await request("/api/paypal/webhooks", {
  method:"POST", headers:{"content-type":"application/json"},body:"{}",
});
assertHttp(webhook,503,"PAYPAL_PREVIEW_DISABLED");
assert.equal((await webhook.json()).error,"PAYMENT_INTEGRATIONS_DISABLED_FOR_PREVIEW");
console.log("PASS anonymous denial and PayPal integration kill switch");

const signin = await request("/api/auth/sign-in/email", {
  method:"POST",headers:{origin:base,"content-type":"application/json"},
  body:JSON.stringify({email:"admin@mandategate.local",password}),
});
assertHttp(signin,200,"HOSTED_ADMIN_LOGIN");
const cookie=signin.headers.get("set-cookie")?.split(";")[0];
assert(cookie && cookie.includes("="),"HOSTED_SESSION_COOKIE_MISSING");
console.log("PASS real hosted admin login");

const headers={cookie};
const dashboard=await request("/dashboard",{headers});
assertHttp(dashboard,200,"HOSTED_AUTH_DASHBOARD");
const dashboardHtml=await dashboard.text();
assert(dashboardHtml.includes("Three-case demo lab"),"DEMO_LINK_NOT_VISIBLE");
const demoPage=await request("/demo",{headers});
assertHttp(demoPage,200,"HOSTED_DEMO_PAGE");
const html = await demoPage.text();
assert(html.includes("Three decisions. Zero current demo executions."),"DEMO_PAGE_MISSING");
assert(html.includes("All local payment execution rows in this demo organization: 0"),
  "DEMO_ORGANIZATION_EXECUTION_COUNT_NOT_ZERO");
assert(html.includes("Recorded earlier PayPal Sandbox payout") &&
  html.includes("BA7V96FCY8Z64"), "HISTORICAL_PAYPAL_PROVENANCE_MISSING");

const path="/api/admin/demo-scenarios";
const crossSite=await request(path,{method:"POST",headers:{...headers,origin:"https://example.invalid"}});
assertHttp(crossSite,403,"CROSS_SITE_POST_BLOCKED");
const anonPost=await request(path,{method:"POST",headers:{origin:base}});
assertHttp(anonPost,401,"ANONYMOUS_POST_BLOCKED");
console.log("PASS demo page, cross-site and anonymous mutation guards");

const create=async()=>{
  const result=await request(path,{method:"POST",headers:{...headers,origin:base}});
  assertHttp(result,200,"DEMO_SCENARIO_CREATION");
  const data=await result.json();
  assert(Array.isArray(data.scenarios)&&data.scenarios.length===3,"DEMO_SCENARIOS_MISSING");
  return data.scenarios;
};
const first=await create();
const expected=[
  ["normal","ALLOW","WITHIN_TRUSTED_BASELINE"],
  ["anomaly","ESCALATE","AMOUNT_OUTSIDE_VENDOR_BASELINE"],
  ["substitution","DENY","DESTINATION_MISMATCH"],
];
for(let i=0;i<expected.length;i++){
  const [id,outcome,reason]=expected[i];
  const observed=first[i];
  assert.equal(observed.id,id);
  assert.equal(observed.outcome,outcome);
  assert(observed.reasonCodes.includes(reason),id+"_REASON_MISSING");
  assert(!observed.hasExecution,id+"_EXECUTION_PRESENT");
  assert(/^[a-f0-9-]{36}$/i.test(observed.requestId),id+"_ID_INVALID");
  const detail=await request("/payments/"+encodeURIComponent(observed.requestId),{headers});
  assertHttp(detail,200,id+"_DETAIL");
  const html=await detail.text();
  assert(html.includes(observed.invoiceNumber),id+"_DETAIL_UNEXPLAINED");
}
console.log("PASS three real hosted deterministic decisions and evidence pages");

const replay=await create();
assert.deepEqual(replay.map(x=>x.requestId),first.map(x=>x.requestId),"DEMO_REPLAY_NOT_IDEMPOTENT");
assert(replay.every(x=>!x.hasExecution),"DEMO_REPLAY_EXECUTED_PAYMENT");

const reviewer=await request("/api/admin/payments/"+first[1].requestId+"/review",{headers});
assertHttp(reviewer,200,"ESCALATION_REVIEW_SNAPSHOT");
const snapshot=await reviewer.json();
assert(/^[a-f0-9]{64}$/.test(snapshot.snapshot?.snapshotSha256??""),"REVIEW_SNAPSHOT_INVALID");
console.log("PASS idempotent replay and evidence-bound escalation review; zero payment executions reported");
