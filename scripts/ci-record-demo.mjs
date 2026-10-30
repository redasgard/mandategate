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
async function submitSyntheticAgentRequest(item){
 const response=await fetch(origin+"/api/agent/payment-requests",{
  method:"POST",headers:{
   authorization:"Bearer "+key,
   "content-type":"application/json",
   "idempotency-key":"mandategate-video-ci-"+item.id.toLowerCase()+"-v2",
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
 return {requestId:json.requestId,outcome:json.decision.outcome,
  reasonCodes:json.decision.reasonCodes,paymentExecuted:false};
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

async function show(path,requiredText,caption,seconds,alreadyOpen=false){
 if(!alreadyOpen){
  const response=await page.goto(origin+path,{waitUntil:"domcontentloaded",timeout:45000});
  assert.equal(response?.status(),200,"CI_DEMO_PAGE_FAILED_"+path);
 }
 await page.getByText(requiredText,{exact:false}).first().waitFor({timeout:20000});
 await page.evaluate(text=>{
  document.getElementById("ci-demo-caption")?.remove();
  const el=document.createElement("div");
  el.id="ci-demo-caption";
  el.textContent=text;
  el.style.cssText=[
   "position:fixed","bottom:13px","left:50%","transform:translateX(-50%)",
   "max-width:90%","padding:11px 18px",
   "background:rgba(5,13,19,.94)","border:1px solid #b98744",
   "color:#fff4e8","font:600 18px/1.35 system-ui,sans-serif",
   "letter-spacing:.01em","text-align:center","border-radius:12px",
   "box-shadow:0 5px 22px rgba(0,0,0,.6)","pointer-events:none",
   "z-index:2147483647",
  ].join(";");
  document.body.append(el);
 },caption);
 const voiceAt=Number(((Date.now()-start)/1000).toFixed(3));
 await page.screenshot({path:join(output,"scene-"+String(traces.length+1).padStart(2,"0")+".png"),fullPage:false});
 await page.mouse.move(740,250);
 if(path.startsWith("/payments/")){
  await page.locator('section[aria-label="Decision explanation"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(Math.min(2500,seconds*250));
  await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
 }
 await page.waitForTimeout(seconds*1000);
 traces.push({path,seconds,caption,voiceAt});
}
async function captureAgentDecision(item,caption){
 // The browser is already on the Payments ledger. Show an actual agent API
 // submission occurring DURING recording, then a real ledger update and click.
 const result=await submitSyntheticAgentRequest(item);
 await page.evaluate(value=>{
  document.getElementById("ci-demo-request")?.remove();
  const box=document.createElement("pre");
  box.id="ci-demo-request";
  box.setAttribute("aria-label","Recorded scoped agent API response");
  box.textContent="POST /api/agent/payment-requests\\n"+
   JSON.stringify(value,null,2);
  box.style.cssText="position:fixed;z-index:2147483646;right:22px;top:96px;max-width:510px;padding:18px;background:#101b23;color:#e9f2df;border:1px solid #b98744;border-radius:10px;font:15px/1.5 ui-monospace,monospace;pointer-events:none;box-shadow:0 8px 35px #0009;white-space:pre-wrap";
  document.body.append(box);
 },result);
 await page.waitForTimeout(1700);
 await page.goto(origin+"/payments",{waitUntil:"domcontentloaded"});
 const row=page.locator('a[href="/payments/'+result.requestId+'"]').first();
 await row.waitFor({timeout:12000});
 await row.scrollIntoViewIfNeeded();
 await page.waitForTimeout(1100);
 await row.click();
 await show("/payments/"+result.requestId,item.invoice,caption,15,true);
}

try{
 await show("/dashboard","Payment operations",
  "MandateGate controls payment authority. Agents never hold PayPal credentials.",12);
 await show("/payments","Payments",
  "Watch three scoped agent API requests enter the real payment ledger.",10);
 await captureAgentDecision(cases[0],
  "ALLOW · trusted recipient · within policy limits · payout disabled in this demo.");
 await captureAgentDecision(cases[1],
  "ESCALATE · unusual amount · queued for human review; no payout.");
 await captureAgentDecision(cases[2],
  "DENY · recipient mismatch · untrusted destination remains blocked.");
 // A real user upload in the actual browser, using a generated fictional image.
 // No external model is called and an image cannot pass the independent PDF
 // verification gate. The resulting review screen MUST show that restriction.
 await page.goto(origin+"/invoice-artifacts",{waitUntil:"domcontentloaded"});
 await page.getByRole("heading",{name:"Upload your invoice"}).waitFor();
 const invoicePage=await ctx.newPage();
 await invoicePage.setContent('<html><body style="font:23px Arial;color:#142332;background:#fff;padding:40px"><h1>FICTIONAL INVOICE - TEST ONLY</h1><p>Northstar Test Services</p><p>Invoice: VIDEO-SOURCE-2026</p><p>Amount: USD 1200.00</p><p>Payee: example.test - NOT REAL</p><p>No purchase or payment authority</p></body></html>');
 const invoiceBytes=await invoicePage.screenshot({type:"png",fullPage:true});
 await invoicePage.close();
 await page.locator('section[aria-label="Upload an invoice"] input[type="file"]')
  .setInputFiles({name:"fictional-northstar-invoice.png",mimeType:"image/png",buffer:invoiceBytes});
 await page.getByRole("button",{name:/Upload & review invoice/}).click();
 await page.waitForURL(/\\/invoice-artifacts\\/[a-f0-9-]{36}$/i,{timeout:20000});
 const invoicePath=new URL(page.url()).pathname;
 await show(invoicePath,"Payment not yet available",
  "Real fictional invoice uploaded and SHA-256 stored. Image evidence cannot authorize a payout.",15,true);
 await show("/sandbox-evidence","PayPal Sandbox integration evidence",
  "ARCHIVE ONLY: separate earlier Sandbox payout; not from these invoices.",19);
 await show("/dashboard","Payment operations",
  "The agent submits. MandateGate authorizes. PayPal execution remains a separate trusted step.",14);
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
