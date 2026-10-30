/**
 * Real browser recording of the tested synthetic MandateGate UI.
 *
 * Only executable inside the isolated Render CI harness: disposable
 * PostgreSQL18 + bound loopback Next server + globally disabled payments.
 * Three canonical requests are submitted via the normal payment-principal
 * API. The browser then navigates the actual rendered application.
 *
 * The archived PayPal receipt is explicitly labelled historical and separate.
 * Video has captions but NO generated narration or fabricated payout.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync,mkdirSync,renameSync,statSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";

const root=process.env.CI_VISUAL_BROWSER_ROOT;
const statePath=process.env.CI_CAPTURE_AUTH_STATE;
const expectedSha=process.env.CI_EXPECTED_SHA;
assert(root && statePath && expectedSha, "CI_DEMO_ENV_REQUIRED");
assert(process.env.CI==="true" &&
  process.env.MANDATEGATE_DISABLE_PAYMENTS==="1" &&
  process.env.MANDATEGATE_RUNTIME_MODE==="legacy" &&
  process.env.PORT==="3000" &&
  process.env.BETTER_AUTH_URL==="http://127.0.0.1:3000" &&
  process.env.DATABASE_URL?.includes("@127.0.0.1:55432/mandategate"),
  "CI_DEMO_REQUIRES_DISPOSABLE_PAYMENT_DISABLED_LOOPBACK");
assert(/^[0-9a-f]{40}$/.test(expectedSha),"CI_DEMO_INVALID_SHA");
const key=process.env.DEMO_PAYMENT_AGENT_API_KEY;
assert(key?.startsWith("mg_payment_ci_only_"),"CI_DEMO_SYNTHETIC_PRINCIPAL_ONLY");

const authState=JSON.parse(readFileSync(statePath,"utf8"));
assert(Array.isArray(authState.cookies)&&authState.cookies.length,
  "CI_DEMO_LOGIN_STATE_MISSING");

const require=createRequire(join(resolve(root),"demo-loader.cjs"));
const {chromium}=require("playwright");
const origin="http://127.0.0.1:3000";
const output=resolve("ci-public/demo");
mkdirSync(output,{recursive:true});

const cases=[
 {id:"ALLOW", invoice:"VIDEO-MG-ROUTINE-2026",amount:120000,destination:"ap@northstar.example",
  expected:"ALLOW",reason:"WITHIN_TRUSTED_BASELINE"},
 {id:"ESCALATE",invoice:"VIDEO-MG-ANOMALY-2026",amount:280000,destination:"ap@northstar.example",
  expected:"ESCALATE",reason:"AMOUNT_OUTSIDE_VENDOR_BASELINE"},
 {id:"DENY",invoice:"VIDEO-MG-CHANGED-PAYEE-2026",amount:120000,destination:"changed-payee@synthetic.invalid",
  expected:"DENY",reason:"DESTINATION_MISMATCH"},
];
for (const item of cases){
 const response=await fetch(origin+"/api/agent/payment-requests",{
  method:"POST",headers:{
   authorization:"Bearer "+key,
   "content-type":"application/json",
   "idempotency-key":"mandategate-video-ci-"+item.id.toLowerCase()+"-v1",
  },
  body:JSON.stringify({
   vendorId:"vendor_northstar",invoiceNumber:item.invoice,
   amountCents:item.amount,currency:"USD",paymentDestination:item.destination,
  }),
  signal:AbortSignal.timeout(15000),
 });
 assert([200,201].includes(response.status),
  "CI_DEMO_FIXTURE_POST_STATUS_"+item.id+"_"+response.status);
 const json=await response.json();
 assert(json.requestId && json.decision?.outcome===item.expected &&
   json.decision?.reasonCodes?.includes(item.reason) &&
   json.paymentExecuted===false,
   "CI_DEMO_FIXTURE_MUST_NOT_PAY_"+item.id);
 item.requestId=json.requestId;
 console.log("CI_DEMO_DECISION_"+item.id+"="+json.decision.outcome+
  " PAYMENT_EXECUTED=false");
}

const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const ctx=await browser.newContext({
 viewport:{width:1280,height:720},deviceScaleFactor:1,
 colorScheme:"dark",reducedMotion:"reduce",
 storageState:authState,
 recordVideo:{dir:output,size:{width:1280,height:720}},
});
const page=await ctx.newPage();
const start=Date.now();
const traces=[];
page.on("pageerror",error=>{throw Error("CI_DEMO_BROWSER_JS_ERROR:"+String(error).slice(0,180))});
await ctx.route("**/*",route=>{
 const u=new URL(route.request().url());
 return u.origin===origin?route.continue():route.abort("blockedbyclient");
});

async function show(path,requiredText,caption,seconds){
 const response=await page.goto(origin+path,{waitUntil:"domcontentloaded",timeout:45000});
 assert.equal(response?.status(),200,"CI_DEMO_PAGE_FAILED_"+path);
 await page.getByText(requiredText,{exact:false}).first().waitFor({timeout:20000});
 await page.evaluate(text=>{
  document.getElementById("ci-demo-caption")?.remove();
  const el=document.createElement("div");
  el.id="ci-demo-caption";
  el.textContent=text;
  el.style.cssText=[
   "position:fixed","bottom:13px","left:50%","transform:translateX(-50%)",
   "width:max-content","max-width:93%","padding:15px 22px",
   "background:rgba(5,13,19,.92)","border:1px solid #b98744",
   "color:#fff4e8","font:600 20px/1.4 system-ui,sans-serif",
   "letter-spacing:.01em","text-align:center","border-radius:12px",
   "box-shadow:0 5px 22px rgba(0,0,0,.6)","pointer-events:none",
   "z-index:2147483647",
  ].join(";");
  document.body.append(el);
 },caption);
 await page.mouse.move(920,350);
 await page.waitForTimeout(seconds*1000);
 traces.push({path,seconds,caption});
}

try{
 await show("/dashboard","Payment operations",
  "Agent requests enter MandateGate. The payment credentials stay server-side.",14);
 await show("/payments","Payments",
  "Three synthetic requests were submitted through the real scoped agent API.",12);
 await show("/payments/"+cases[0].requestId,cases[0].invoice,
  "ALLOW: policy permits this request. No PayPal payout was sent.",18);
 await show("/payments/"+cases[1].requestId,cases[1].invoice,
  "ESCALATE: the unusual amount requires human investigation.",18);
 await show("/payments/"+cases[2].requestId,cases[2].invoice,
  "DENY: a PDF cannot replace the trusted payment destination.",18);
 await show("/invoice-artifacts","Process an invoice",
  "GLM observations are advisory. Independent T2 / T3 / T4 evidence is required.",18);
 await show("/sandbox-evidence","PayPal Sandbox integration evidence",
  "Archived SUCCESS from an earlier separate Sandbox payout, NOT these PDFs.",22);
 await show("/dashboard","Payment operations",
  "AI can propose. Deterministic policy controls authority. PayPal executes only approved payments.",16);
} finally{
 const video=page.video();
 await ctx.close();
 await browser.close();
 if(video){
  const source=await video.path();
  const destination=join(output,"mandategate-real-browser-demo.webm");
  renameSync(source,destination);
  const bytes=statSync(destination).size;
  assert(bytes>150_000,"CI_DEMO_VIDEO_EMPTY");
  const seconds=(Date.now()-start)/1000;
  assert(seconds<175 && seconds>85,"CI_DEMO_VIDEO_LENGTH_OUT_OF_RANGE_"+seconds);
  writeFileSync(join(output,"manifest.json"),JSON.stringify({
   contract:"mandategate/real-browser-demo/v1",
   commit:expectedSha,
   environment:"isolated synthetic Next.js + disposable PostgreSQL 18",
   paymentsDisabled:true,paymentPosts:0,providerCalls:0,
   class:"Real browser recording, NOT end-to-end invoice payout",
   historicalReceiptSeparate:true,
   captureDurationSeconds:Number(seconds.toFixed(1)),
   file:"mandategate-real-browser-demo.webm",
   bytes,scenes:traces,
  },null,2)+"\n");
  console.log("CI_DEMO_REAL_BROWSER_CAPTURE_PASS bytes="+bytes+
   " seconds="+seconds.toFixed(1)+" payment_posts=0");
 }
}
