/**
 * Actual UI action recording, not a slideshow of pre-created decisions.
 * Enforces isolated synthetic PostgreSQL, no provider credentials and no payouts.
 * A fictional PDF is uploaded through the same admin form judges can use.
 * The demo button submits the three canonical policy requests while on camera.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync,mkdirSync,renameSync,statSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";

const env=process.env;
assert(env.CI==="true" && env.MANDATEGATE_EMBEDDED_POSTGRES_CI==="1" &&
 env.MANDATEGATE_DISABLE_PAYMENTS==="1" &&
 env.MANDATEGATE_RUNTIME_MODE==="legacy" &&
 env.DATABASE_URL==="postgresql://postgres:postgres@127.0.0.1:55432/mandategate" &&
 env.BETTER_AUTH_URL==="http://127.0.0.1:3000" && env.PORT==="3000" &&
 env.DEMO_ADMIN_EMAIL==="admin@mandategate.local" &&
 env.DEMO_PAYMENT_AGENT_API_KEY==="mg_payment_ci_only_synthetic_agent_key_2026" &&
 !env.PAYPAL_CLIENT_ID && !env.PAYPAL_CLIENT_SECRET && !env.EXPLABS_API_KEY,
 "DEMO_REQUIRES_EXACT_PAYMENT_DISABLED_CI_LAB");
assert(/^[0-9a-f]{40}$/.test(env.CI_EXPECTED_SHA??""),"DEMO_EXPECTED_SHA_MISSING");
assert(env.CI_VISUAL_BROWSER_ROOT && env.CI_CAPTURE_AUTH_STATE,"DEMO_AUTH_PATH_MISSING");
const authState=JSON.parse(readFileSync(env.CI_CAPTURE_AUTH_STATE,"utf8"));
assert(authState.cookies?.length>0,"DEMO_LOGIN_REQUIRED");

const require=createRequire(join(resolve(env.CI_VISUAL_BROWSER_ROOT),"demo-loader.cjs"));
const {chromium}=require("playwright");
const origin="http://127.0.0.1:3000";
const output=resolve("ci-public/demo");
mkdirSync(output,{recursive:true});
const traces=[];
const expected=[
 {id:"normal",title:"Normal vendor invoice",invoice:"DEMO-NORMAL-2026",result:"ALLOW",
  reason:"WITHIN_TRUSTED_BASELINE"},
 {id:"anomaly",title:"Unusual vendor amount",invoice:"DEMO-ANOMALY-2026",result:"ESCALATE",
  reason:"AMOUNT_OUTSIDE_VENDOR_BASELINE"},
 {id:"substitution",title:"Changed invoice destination",invoice:"DEMO-SUBSTITUTION-2026",
  result:"DENY",reason:"DESTINATION_MISMATCH"},
];
const browser=await chromium.launch({
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage"],
});
let fixture;
try{
 const fixtureContext=await browser.newContext({viewport:{width:860,height:1100}});
 const fixturePage=await fixtureContext.newPage();
 await fixturePage.setContent(
  '<!doctype html><html><head><meta charset="utf-8"><style>'+
  'body{margin:0;padding:60px;font:20px/1.7 Arial;color:#22313d;background:white}'+
  'header{border-bottom:5px solid #283943;margin-bottom:35px;padding-bottom:15px}'+
  'h1{font-size:44px;margin:0}h2{margin-top:45px}b{color:#171f27}'+
  '.label{color:#a04d26;letter-spacing:.12em;font-weight:800}'+
  '.total{font-size:35px;border-top:2px solid #999;padding-top:16px}'+
  'footer{margin-top:70px;border-top:1px solid #aaa;padding-top:15px;font-size:15px}'+
  '</style></head><body><header><span class="label">SYNTHETIC TEST DATA</span>'+
  '<h1>Northstar Components</h1><p>Fictional supplier · testing only</p></header>'+
  '<h2>Invoice DEMO-PDF-OCT29-2026</h2>'+
  '<p><b>Invoice date:</b> 2026-10-29<br><b>Vendor name:</b> Northstar Components<br>'+
  '<b>Currency:</b> USD<br><b>Payment destination:</b> ap@northstar.example</p>'+
  '<h2>Services</h2><p>Control system maintenance · 1 unit · USD 1,200.00</p>'+
  '<p class="total"><b>Total due: USD 1200.00</b></p>'+
  '<footer>FICTIONAL SOURCE. NOT ISSUER-VERIFIED OR AUTHORIZED FOR PAYMENT.'+
  'No real customer or financial account appears in this document.</footer>'+
  '</body></html>',{waitUntil:"load"});
 fixture=await fixturePage.pdf({format:"A4",printBackground:true});
 assert(Buffer.isBuffer(fixture) && fixture.length>2500 && fixture.length<500000,
  "DEMO_SYNTHETIC_PDF_INVALID");
 await fixtureContext.close();

 const ctx=await browser.newContext({
  viewport:{width:1440,height:810},deviceScaleFactor:1,
  colorScheme:"dark",reducedMotion:"reduce",storageState:authState,
  recordVideo:{dir:output,size:{width:1440,height:810}},
 });
 await ctx.route("**/*",route=>{
  const url=new URL(route.request().url());
  return url.origin===origin?route.continue():route.abort("blockedbyclient");
 });
 const page=await ctx.newPage();
 const browserErrors=[];
 page.on("pageerror",e=>browserErrors.push(String(e).slice(0,200)));
 const start=Date.now();
 let submitted=0,uploaded=0,declined=0;
 function seconds(){return (Date.now()-start)/1000;}
 async function stage(label){
  await page.evaluate(text=>{
   let el=document.getElementById("mg-demo-status");
   if(!el){el=document.createElement("aside");el.id="mg-demo-status";
    el.style.cssText=[
     "position:fixed","right:24px","bottom:20px","z-index:2147483646",
     "max-width:320px","background:rgba(16,23,29,.94)",
     "color:#f5e8d4","border:1px solid #caa06d",
     "border-radius:10px","padding:12px 15px",
     "font:600 17px/1.35 system-ui,sans-serif",
     "box-shadow:0 4px 18px rgba(0,0,0,.35)","pointer-events:none",
    ].join(";");
    document.body.appendChild(el);
   }
   el.textContent=text;
  },label);
 }
 async function scrollTo(locator){
  await locator.evaluate(el=>el.scrollIntoView({behavior:"smooth",block:"center"}));
  await page.waitForTimeout(850);
 }
 async function scene(id,duration,work){
  const begin=seconds();
  await work();
  const used=seconds()-begin;
  const rest=Math.max(0,duration-used);
  if(rest>0)await page.waitForTimeout(Math.round(rest*1000));
  const end=seconds();
  traces.push({id,startSeconds:Number(begin.toFixed(2)),endSeconds:Number(end.toFixed(2)),
   durationSeconds:Number((end-begin).toFixed(2))});
  console.log("CI_DEMO_SCENE="+id+" start="+begin.toFixed(2)+" end="+end.toFixed(2));
 }
 async function navigate(path,heading){
  const response=await page.goto(origin+path,{waitUntil:"domcontentloaded",timeout:45000});
  assert.equal(response?.status(),200,"CI_DEMO_ROUTE_UNAVAILABLE_"+path);
  await page.getByRole("heading",{name:heading,exact:false}).first().waitFor({timeout:20000});
  await page.evaluate(()=>document.fonts.ready);
 }
 async function detail(item){
  await navigate("/demo","Three decisions");
  const card=page.locator("#demo-decisions article.risk-evidence-card")
    .filter({hasText:item.title});
  await scrollTo(card);
  await page.waitForTimeout(550);
  await card.getByRole("link",{name:/Inspect original decision/}).click();
  await page.getByRole("heading",{name:"Payment investigation"}).waitFor({timeout:20000});
  await page.getByText(item.invoice,{exact:false}).first().waitFor();
  const text=await page.locator("main").innerText();
  assert(text.includes(item.reason) && text.includes(item.result),
   "CI_DEMO_REAL_DECISION_MISSING_"+item.id);
  await stage(item.id==="normal"
   ?"ALLOW · trusted destination + within limit"
   :item.id==="anomaly"
    ?"ESCALATE · amount above vendor baseline"
    :"DENY · attempted recipient substitution");
  await page.waitForTimeout(600);
  await page.mouse.wheel(0,255);
  await page.waitForTimeout(650);
 }
 let recordingComplete=false;
 try{
  await scene("01-business-problem",17,async()=>{
   await navigate("/dashboard","Payment operations");
   await stage("AI agents request payments · MandateGate controls authority");
   await page.mouse.move(820,430,{steps:18});
   await page.getByRole("link",{name:"Payments",exact:true}).first().hover();
  });

  await scene("02-invoice-document-review",32,async()=>{
   await navigate("/invoice-artifacts","Process an invoice");
   console.log("CI_DEMO_PDF_STAGE=navigated");
   await stage("Upload invoice PDF · preserve original source evidence");
   const input=page.locator('input[type="file"]').first();
   await scrollTo(input);
   await input.setInputFiles({name:"northstar-fictional-test.pdf",
    mimeType:"application/pdf",buffer:fixture});
   console.log("CI_DEMO_PDF_STAGE=file_selected bytes="+fixture.length);
   await page.waitForTimeout(700);
   const upload=page.getByRole("button",{name:/Upload & review invoice/});
   const uploadResponsePromise=page.waitForResponse(r=>
    new URL(r.url()).pathname==="/api/admin/invoice-artifacts" &&
    r.request().method()==="POST",{timeout:25000});
   await upload.click();
   const uploadResponse=await uploadResponsePromise;
   console.log("CI_DEMO_PDF_STAGE=received_response status="+uploadResponse.status());
   assert([200,201].includes(uploadResponse.status()),
     "CI_DEMO_UI_PDF_UPLOAD_STATUS_"+uploadResponse.status());
   const stored=await uploadResponse.json();
   assert(stored?.trustState==="STORED_UNTRUSTED" &&
    stored?.sourceVerified===false &&
    stored?.issuerAuthenticated===false &&
    stored?.paymentExecuted===false &&
    stored?.sourcePreparation?.state==="PARSER_TEXT_AVAILABLE_UNVERIFIED" &&
    stored?.sourcePreparation?.pageCount>=1,
    "CI_DEMO_REAL_PDF_PARSER_OR_PROVENANCE_FAILED");
   await page.waitForURL(url=>/^\/invoice-artifacts\/[a-f0-9-]{36}$/.test(url.pathname),{timeout:30000});
   await page.getByRole("heading",{name:"Three short checks before payment"})
    .waitFor({timeout:30000});
   await page.getByText("Confirm the invoice details",{exact:false}).first()
    .waitFor({timeout:15000});
   const reviewHeading=page.locator("main").getByRole("heading",{
    name:"Three short checks before payment"});
   assert(await reviewHeading.isVisible(),"CI_DEMO_PDF_REVIEW_HEADING_NOT_VISIBLE");
   const verifyHeading=page.locator("main").getByRole("heading",{
    name:"Confirm the invoice details"});
   assert(await verifyHeading.isVisible(),"CI_DEMO_PDF_VERIFY_WORKFLOW_MISSING");
   console.log("CI_DEMO_PDF_STAGE=review_loaded pathname="+new URL(page.url()).pathname);
   const originalSource=page.getByRole("link",{name:/View original invoice/});
   assert(await originalSource.count()>0,"CI_DEMO_ORIGINAL_PDF_LINK_MISSING");
   const evidence=page.getByText("Show PDF source text and hashes",{exact:false});
   await evidence.waitFor({timeout:8000});
   await scrollTo(evidence);
   await evidence.click();
   const sourcePre=page.locator(".review-page pre").first();
   await sourcePre.waitFor({state:"visible",timeout:12000});
   const pdfSourceText=await sourcePre.innerText();
   assert(pdfSourceText.includes("DEMO-PDF-OCT29-2026") &&
      pdfSourceText.includes("Northstar Components") &&
      pdfSourceText.includes("ap@northstar.example"),
      "CI_DEMO_SOURCE_TEXT_NOT_EVIDENCED");
   console.log("CI_DEMO_PDF_STAGE=original_text_visible");
   uploaded=1;
   await stage("PDF saved · fields extracted · reviewer checks source");
   console.log("CI_DEMO_PDF_SOURCE_REVIEW_PASS uploaded=1");
   await page.waitForTimeout(1200);
   await navigate("/demo","Three decisions");
   const earlier=page.locator("#demo-historical-glm");
   await scrollTo(earlier);
   const archivedText=await earlier.innerText();
   assert(archivedText.includes("DOCUMENT_INSTRUCTIONS_SUSPECTED") &&
      archivedText.includes("INVALID_AMOUNT") &&
      archivedText.includes("DEMO-GLM-INVOICE-003") &&
      archivedText.includes("not") && archivedText.includes("this recording"),
    "CI_DEMO_ARCHIVED_GLM_EVIDENCE_INVALID");
   await stage("Separate saved GLM test · suspicious invoice instruction flagged");
   console.log("CI_DEMO_HISTORICAL_GLM_ARCHIVE_VISIBLE");
  });

  await scene("03-agent-submits-requests",17,async()=>{
   await navigate("/demo","Three decisions");
   await stage("An operations agent submits 3 requests for the same supplier");
   const button=page.getByRole("button",{name:"Load or replay three demo decisions"});
   await scrollTo(button);
   await page.waitForTimeout(700);
   const responsePromise=page.waitForResponse(r=>
    new URL(r.url()).pathname==="/api/admin/demo-scenarios" &&
    r.request().method()==="POST",{timeout:25000});
   await button.click();
   const submittedResponse=await responsePromise;
   assert.equal(submittedResponse.status(),200,"CI_DEMO_UI_SUBMISSION_REJECTED");
   const submission=await submittedResponse.json();
   assert(Array.isArray(submission.scenarios)&&submission.scenarios.length===3 &&
     submission.scenarios.every(x=>x.hasExecution===false &&
       x.outcome===x.expectedOutcome && x.requestId),
     "CI_DEMO_ADMIN_UI_CANONICAL_SUBMISSION_INVALID");
   await page.getByText("Three synthetic decisions are available.",{exact:false})
    .first().waitFor({timeout:25000});
   for(const item of expected){
    const card=page.locator("#demo-decisions article.risk-evidence-card")
      .filter({hasText:item.title});
    await card.getByText("Observed outcome: "+item.result,{exact:false}).waitFor();
    const text=await card.innerText();
    assert(text.includes(item.reason),"CI_DEMO_UI_REASON_MISSING_"+item.id);
    assert(text.includes("No payment execution record"),
     "CI_DEMO_UI_PAYOUT_STATE_MISSING_"+item.id);
   }
   submitted=3;
   await scrollTo(page.locator("#demo-decisions"));
   await stage("Actual policy results: ALLOW · ESCALATE · DENY");
   console.log("CI_DEMO_UI_REQUEST_CREATION_PASS="+submitted);
  });

  await scene("04-allow-trusted-payment",16,async()=>detail(expected[0]));
  await scene("05-escalation-human-review",23,async()=>{
   await detail(expected[1]);
   const explanation=page.locator('section[aria-label="Human escalation review"] textarea').first();
   await scrollTo(explanation);
   await explanation.fill("Amount is above this supplier's normal threshold. Decline pending independent review.");
   page.once("dialog",dialog=>void dialog.accept());
   const receipt=page.waitForResponse(r=>
    /^\/api\/admin\/payments\/[^/]+\/review$/.test(new URL(r.url()).pathname) &&
    r.request().method()==="POST",{timeout:25000});
   await page.getByRole("button",{name:"Decline without payout"}).click();
   const reviewed=await receipt;
   assert.equal(reviewed.status(),200,"CI_DEMO_HUMAN_REVIEW_FAILED");
   const result=await reviewed.json();
   assert(result && !result.paymentExecuted,"CI_DEMO_REVIEW_COULD_NOT_SUBMIT_PAYOUT");
   declined=1;
   await stage("Human review: declined with a reason · no payout");
   console.log("CI_DEMO_HUMAN_ESCALATION_DECLINED_WITHOUT_PAYOUT");
  });

  await scene("06-deny-changed-recipient",14,async()=>detail(expected[2]));

  await scene("07-paypal-sandbox-proof",22,async()=>{
   await navigate("/sandbox-evidence","PayPal Sandbox integration evidence");
   const proof=page.getByText("SUCCESS (historical)",{exact:false}).first();
   await scrollTo(proof);
   const body=await page.locator("main").innerText();
   assert(body.includes("Payout batch:") && body.includes("Payout item:") &&
    body.includes("verified webhook"),
    "CI_DEMO_ARCHIVED_PAYPAL_EVIDENCE_INCOMPLETE");
   await stage("PayPal Sandbox integration test · SUCCESS + verified webhook");
   await page.mouse.move(660,390,{steps:14});
  });

  await scene("08-business-outcome",16,async()=>{
   await navigate("/dashboard","Payment operations");
   await stage("AI interprets · policy authorizes · PayPal executes");
   await page.mouse.move(540,370,{steps:18});
  });

  assert(browserErrors.length===0,"CI_DEMO_BROWSER_ERRORS_"+browserErrors.join("|"));
  assert(submitted===3&&uploaded===1&&declined===1,"CI_DEMO_ACTUAL_ACTIONS_MISSING");
  recordingComplete=true;
 }finally{
  const video=page.video();
  await ctx.close();
  if(video){
   const from=await video.path();
   const to=join(output,"mandategate-real-browser-demo.webm");
   renameSync(from,to);
   assert(statSync(to).size>150000,"CI_DEMO_VIDEO_EMPTY");
   const length=seconds();
   if(!recordingComplete){console.error("CI_DEMO_INCOMPLETE_RECORDING_NOT_PUBLISHABLE");}
   if(recordingComplete){
   assert(length>85&&length<178,"CI_DEMO_LENGTH_INVALID_"+length);
   writeFileSync(join(output,"manifest.json"),JSON.stringify({
    contract:"mandategate/real-browser-demo/v2",
    commit:env.CI_EXPECTED_SHA,recordingType:"actual_interactive_application",
    environment:"isolated PostgreSQL 18 + authenticated local Next.js",
    paymentsDisabled:true,paymentPosts:0,providerCalls:0,
    fictionalPdfUploaded:uploaded===1,
    actualUiSubmittedCanonicalDecisions:submitted,
    humanEscalationDeclined:declined===1,
    sourcePdfNotPayPalAuthorized:true,
    historicalReceiptSeparate:true,historicalGlmObservationSeparate:true,
    captureDurationSeconds:Number(length.toFixed(2)),
    file:"mandategate-real-browser-demo.webm",bytes:statSync(to).size,scenes:traces,
   },null,2)+"\n");
   console.log("CI_DEMO_REAL_INTERACTIONS_PASS source_pdf="+uploaded+
    " submitted_decisions="+submitted+" payout_posts=0 seconds="+length.toFixed(2));
   }
  }
 }
}finally{
 await browser.close();
}
