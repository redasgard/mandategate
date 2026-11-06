/**
 * MandateGate live demo recorder — hackathon video capture.
 *
 * Records the FULL product journey on the live Render host:
 *   Scene 1: Dashboard hook — product problem statement
 *   Scene 2: Invoice upload + AI extraction + source verification
 *   Scene 3: Three agent-submitted policy decisions (ALLOW/ESCALATE/DENY)
 *   Scene 4: ALLOW detail — trusted payment within limits
 *   Scene 5: ESCALATE detail + human DECLINE with explanation
 *   Scene 6: DENY detail — changed recipient blocked
 *   Scene 7: Invoice-derived PayPal Sandbox payout (T2→T3→T4→Execute→Reconcile)
 *   Scene 8: Business outcome — dashboard with evidence
 *
 * PREREQUISITES:
 *   - Live Render host at LIVE_ORIGIN with the ae886ff+ build deployed
 *   - LIVE_ADMIN_EMAIL and LIVE_ADMIN_PASSWORD (from ~/.config/mandategate/live-admin.env)
 *   - Playwright installed locally (uses system chromium or CI_VISUAL_BROWSER_ROOT)
 *   - MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO=1 on the live host
 *   - NO_PAYOUT=1 to skip the actual Execute step (record without paying)
 *   - LIVE_PAYOUT=1 to actually execute the PayPal Sandbox payout (ONCE only)
 *
 * Output: live-demo/ directory with .webm, manifest.json, and per-scene screenshots.
 */
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {createRequire} from "node:module";

// --- Environment ---
const env=process.env;
const origin=env.LIVE_ORIGIN??"https://mandategate-web.onrender.com";
const email=env.LIVE_ADMIN_EMAIL;
const password=env.LIVE_ADMIN_PASSWORD;
assert(email&&password,"LIVE_ADMIN_EMAIL and LIVE_ADMIN_PASSWORD required");

const doPayment=env.EXECUTE_PAYOUT==="1";
const finalTake=env.FINAL_TAKE==="1";
if(doPayment&&!finalTake)throw Error("EXECUTE_PAYOUT requires FINAL_TAKE=1");
// SAFETY: default mode is a read-only selector smoke test. One-shot state
// (human decline, invoice prepare, payout execute) is only consumed when
// FINAL_TAKE=1 — never accidentally.
console.log("LIVE_MODE="+(finalTake?(doPayment?"FINAL_EXECUTE":"FINAL_NO_EXECUTE"):"READ_ONLY_SMOKE"));

// Find Playwright
const browserRoot=env.CI_VISUAL_BROWSER_ROOT??
  (existsSync("node_modules/playwright")?resolve("node_modules/playwright"):null);
assert(browserRoot,"Playwright not found; set CI_VISUAL_BROWSER_ROOT or install playwright");
const require=createRequire(join(resolve(browserRoot),"demo-loader.cjs"));
const {chromium}=require("playwright");

const output=resolve("live-demo");
mkdirSync(output,{recursive:true});

const traces=[];
const evidence={};

const browser=await chromium.launch({
  headless:true,args:["--no-sandbox","--disable-dev-shm-usage"],
});

try{
  // --- Sign in ---
  const signCtx=await browser.newContext({
    viewport:{width:1440,height:810},colorScheme:"dark",reducedMotion:"reduce",
  });
  const signPage=await signCtx.newPage();
  await signPage.goto(origin+"/sign-in",{waitUntil:"networkidle",timeout:60000});
  await signPage.getByRole("heading",{name:"Financial authority stays here."}).waitFor({timeout:30000});
  await signPage.getByLabel("Work email").fill(email);
  await signPage.getByLabel("Password").fill(password);
  await signPage.getByRole("button",{name:/Sign in to MandateGate/}).click();
  await signPage.waitForURL(url=>url.pathname==="/dashboard",{
    waitUntil:"domcontentloaded",timeout:30000,
  });
  const authState=await signCtx.storageState();
  assert(authState.cookies?.length>0,"SIGNIN_FAILED");
  await signCtx.close();
  console.log("LIVE_SIGNIN_OK");

  // --- Recording context ---
  const ctx=await browser.newContext({
    viewport:{width:1440,height:810},deviceScaleFactor:1,
    colorScheme:"dark",reducedMotion:"reduce",storageState:authState,
    recordVideo:{dir:output,size:{width:1440,height:810}},
  });
  const page=await ctx.newPage();
  const browserErrors=[];
  page.on("pageerror",e=>browserErrors.push(String(e).slice(0,200)));
  const start=Date.now();
  function seconds(){return (Date.now()-start)/1000;}

  async function stage(label){
    await page.evaluate(text=>{
      let el=document.getElementById("mg-demo-status");
      if(!el){el=document.createElement("aside");el.id="mg-demo-status";
        el.style.cssText=[
          "position:fixed","right:24px","bottom:20px","z-index:2147483646",
          "max-width:264px","background:rgba(16,23,29,.94)",
          "color:#f5e8d4","border:1px solid #caa06d",
          "border-radius:9px","padding:9px 12px",
          "font:600 15px/1.3 system-ui,sans-serif",
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
    await page.screenshot({path:join(output,`scene-${id}.jpg`),type:"jpeg",quality:80});
    console.log("LIVE_SCENE="+id+" start="+begin.toFixed(2)+" end="+end.toFixed(2));
  }
  async function navigate(path,heading){
    const response=await page.goto(origin+path,{waitUntil:"domcontentloaded",timeout:45000});
    assert(response?.ok(),"LIVE_ROUTE_FAILED_"+path+"_"+response?.status());
    await page.getByRole("heading",{name:heading,exact:false}).first().waitFor({timeout:20000});
    await page.evaluate(()=>document.fonts.ready);
  }

  const expected=[
    {id:"normal",title:"Normal vendor invoice",invoice:"DEMO-NORMAL-2026",result:"ALLOW",
      reason:"WITHIN_TRUSTED_BASELINE"},
    {id:"anomaly",title:"Unusual vendor amount",invoice:"DEMO-ANOMALY-2026",result:"ESCALATE",
      reason:"AMOUNT_OUTSIDE_VENDOR_BASELINE"},
    {id:"substitution",title:"Changed invoice destination",invoice:"DEMO-SUBSTITUTION-2026",
      result:"DENY",reason:"DESTINATION_MISMATCH"},
  ];

  async function detail(item){
    await navigate("/demo","Three decisions");
    const card=page.locator("#demo-decisions article.risk-evidence-card")
      .filter({hasText:item.title});
    await scrollTo(card);
    await page.waitForTimeout(550);
    await card.getByRole("link",{name:/Inspect original decision/}).click();
    await page.getByRole("heading",{name:"Payment investigation"}).waitFor({timeout:20000});
    await page.getByText(item.invoice,{exact:false}).first().waitFor();
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
    // === SCENE 1: Dashboard / product hook ===
    await scene("01-business-problem",19,async()=>{
      await navigate("/dashboard","Payment operations");
      await stage("AI agents request payments · MandateGate controls authority");
      await page.mouse.move(820,430,{steps:18});
      await page.getByRole("link",{name:"Payments",exact:true}).first().hover();
    });

    // === SCENE 2: Invoice upload + AI + source review ===
    await scene("02-invoice-document-review",35,async()=>{
      await navigate("/invoice-artifacts","Process an invoice");
      if(!finalTake){
        // READ-ONLY SMOKE: assert the fixture lane is enabled, touch nothing.
        const fixture=page.getByRole("link",{name:/Download Northstar invoice/});
        await fixture.waitFor({timeout:10000});
        console.log("LIVE_SMOKE_FIXTURE_CARD_VISIBLE");
        await scrollTo(fixture);
        return;
      }
      await stage("Upload invoice PDF · preserve original source evidence");
      // Download the Northstar test PDF
      const pdfResponse=await page.evaluate(async(o)=>{
        const r=await fetch(o+"/api/admin/sandbox-invoice-fixture",{credentials:"include"});
        if(!r.ok)return null;
        const buf=await r.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      },origin);
      // Validity check, not a size check: minimal generated PDFs can be <1 KB.
      const pdfOk=Array.isArray(pdfResponse)&&pdfResponse.length>500&&
        pdfResponse[0]===0x25&&pdfResponse[1]===0x50&&pdfResponse[2]===0x44&&pdfResponse[3]===0x46;
      assert(pdfOk,"LIVE_PDF_DOWNLOAD_FAILED");
      const pdfBuffer=Buffer.from(pdfResponse);

      const input=page.locator('input[type="file"]').first();
      await scrollTo(input);
      await input.setInputFiles({name:"northstar-sandbox-test.pdf",
        mimeType:"application/pdf",buffer:pdfBuffer});
      await page.waitForTimeout(700);
      const upload=page.getByRole("button",{name:/Upload & review invoice/});
      const uploadResp=page.waitForResponse(r=>
        new URL(r.url()).pathname==="/api/admin/invoice-artifacts"&&
        r.request().method()==="POST",{timeout:25000});
      await upload.click();
      const resp=await uploadResp;
      assert([200,201].includes(resp.status()),"LIVE_UPLOAD_STATUS_"+resp.status());
      const stored=await resp.json();
      // Response shape: {artifact:{artifactId,sha256,...},...}; deterministic
      // fixture PDFs replay to the existing artifact (200 + replayed).
      evidence.artifactId=stored?.artifact?.artifactId??stored?.id??null;
      evidence.artifactSha256=stored?.artifact?.sha256??stored?.sha256??null;
      evidence.trustState=stored?.trustState;
      evidence.uploadReplayed=resp.status()===200;

      await page.waitForURL(url=>/^\/invoice-artifacts\/[a-f0-9-]{36}$/.test(url.pathname),{timeout:30000});
      if(!evidence.artifactId)evidence.artifactId=page.url().split("/").pop();
      await page.getByRole("heading",{name:"Three short checks before payment"})
        .waitFor({timeout:30000});
      await stage("PDF saved · AI extracts facts · reviewer checks source");

      // Show PDF source evidence
      const evidenceToggle=page.getByText("Show PDF source text and hashes",{exact:false});
      await evidenceToggle.waitFor({timeout:8000});
      await scrollTo(evidenceToggle);
      await evidenceToggle.click();
      const sourcePre=page.locator(".review-page pre").first();
      await sourcePre.waitFor({state:"visible",timeout:12000});
      await stage("Invoice source text preserved · Northstar Components · USD 1.01");
      await page.waitForTimeout(1200);

      // Show GLM archive (CI-only section: on the live host the
      // isolatedCiDemoEnabled gate hides it — skip gracefully).
      await navigate("/demo","Three decisions");
      const earlier=page.locator("#demo-historical-glm");
      if(await earlier.count()===0){
        console.log("LIVE_SKIP_GLM_SECTION_NOT_RENDERED_ON_HOST");
        return;
      }
      await scrollTo(earlier);
      await stage("AI detected suspicious instructions in a prior invoice");
    });

    // === SCENE 3: Agent submits three requests ===
    await scene("03-agent-submits-requests",finalTake?17:10,async()=>{
      await navigate("/demo","Three decisions");
      if(!finalTake){
        // READ-ONLY SMOKE: button must exist; do not submit yet.
        await page.getByRole("button",{name:"Load or replay three demo decisions"})
          .waitFor({timeout:10000});
        console.log("LIVE_SMOKE_LOAD_BUTTON_VISIBLE");
        return;
      }
      await stage("An operations agent submits 3 requests for the same supplier");
      const cardSel="#demo-decisions article.risk-evidence-card";
      const existing=await page.locator(cardSel).count();
      if(existing>=3){
        // Live host: the canonical requests already exist in the seeded demo
        // org (the lab create route is receiver-guarded on live). Display the
        // persisted requests; nothing is re-submitted.
        console.log("LIVE_SCENARIOS_ALREADY_PRESENT="+existing);
        evidence.scenarioRequestIds=await page.locator("#demo-decisions a[href^='/payments/']")
          .evaluateAll(as=>as.map(a=>a.getAttribute("href").split("/").pop()));
      }else{
        const button=page.getByRole("button",{name:"Load or replay three demo decisions"});
        await scrollTo(button);
        await page.waitForTimeout(700);
        const responsePromise=page.waitForResponse(r=>
          new URL(r.url()).pathname==="/api/admin/demo-scenarios"&&
          r.request().method()==="POST",{timeout:25000});
        await button.click();
        const submittedResponse=await responsePromise;
        assert.equal(submittedResponse.status(),200,"LIVE_SUBMISSION_REJECTED");
        const submission=await submittedResponse.json();
        assert(Array.isArray(submission.scenarios)&&submission.scenarios.length===3,
          "LIVE_CANONICAL_SUBMISSION_INVALID");
        evidence.scenarioRequestIds=submission.scenarios.map(s=>s.requestId);
        await page.getByText("Three synthetic decisions are available.",{exact:false})
          .first().waitFor({timeout:25000}).catch(()=>{});
      }
      for(const item of expected){
        const card=page.locator(cardSel).filter({hasText:item.title});
        await card.getByText("Observed outcome: "+item.result,{exact:false}).waitFor();
      }
      await scrollTo(page.locator("#demo-decisions"));
      await stage("Actual policy results: ALLOW · ESCALATE · DENY");
    });

    // === SCENE 4: ALLOW detail ===
    await scene("04-allow-trusted-payment",16,async()=>detail(expected[0]));

    // === SCENE 5: ESCALATE + human DECLINE (one-shot; final take only) ===
    await scene("05-escalation-human-review",finalTake?23:16,async()=>{
      await detail(expected[1]);
      if(!finalTake){
        await stage("ESCALATE · human review required (smoke: nothing submitted)");
        return;
      }
      // Idempotent: if the human DECLINE was already recorded (earlier
      // authorized take), show the persisted decision instead of re-declining.
      const prior=await page.getByText("Prior human decision",{exact:false}).count();
      if(prior>0){
        console.log("LIVE_DECLINE_ALREADY_CONSUMED_FROM_EARLIER_TAKE");
        evidence.declineReadback="prior DECLINE decision persisted (earlier authorized take)";
        await stage("Human review: declined with a reason · no payout");
        return;
      }
      const explanation=page.locator('section[aria-label="Human escalation review"] textarea').first();
      await scrollTo(explanation);
      await explanation.fill("Amount is above this supplier's normal threshold. Decline pending independent review.");
      page.once("dialog",dialog=>void dialog.accept());
      const receipt=page.waitForResponse(r=>
        /^\/api\/admin\/payments\/[^/]+\/review$/.test(new URL(r.url()).pathname)&&
        r.request().method()==="POST",{timeout:25000});
      await page.getByRole("button",{name:"Decline without payout"}).click();
      const reviewed=await receipt;
      assert.equal(reviewed.status(),201,"LIVE_HUMAN_REVIEW_FAILED");
      const result=await reviewed.json();
      const review=result?.review;
      // Exact response-shape assertion (the CI recorder fix, carried to live).
      assert(review&&review.action==="DECLINE"&&review.status==="DECLINED"&&
        review.approvedForExecution===false&&review.executed===false&&
        typeof review.reviewId==="string"&&typeof review.requestId==="string",
        "LIVE_HUMAN_REVIEW_SHAPE_INVALID");
      evidence.declineReviewId=review.reviewId;
      evidence.declineRequestId=review.requestId;
      // Independent read-only readback: reload the page and confirm the
      // persisted DECLINE is what the product now shows.
      await page.reload({waitUntil:"domcontentloaded",timeout:30000});
      await page.getByText("Prior human decision",{exact:false}).first().waitFor({timeout:15000});
      const declinedText=await page.locator("main").innerText();
      assert(declinedText.includes("DECLINE"),"LIVE_DECLINE_READBACK_MISSING");
      evidence.declineReadback="reload shows prior DECLINE decision";
      await stage("Human review: declined with a reason · no payout");
    });

    // === SCENE 6: DENY detail ===
    await scene("06-deny-changed-recipient",14,async()=>detail(expected[2]));

    // === SCENE 7: Invoice-derived PayPal Sandbox flow ===
    await scene("07-paypal-sandbox-live",finalTake?45:12,async()=>{
      if(!finalTake){
        // READ-ONLY SMOKE: archived evidence page must render.
        await navigate("/sandbox-evidence","PayPal Sandbox integration evidence");
        await page.getByText("SUCCESS (historical)",{exact:false}).first().waitFor({timeout:15000});
        console.log("LIVE_SMOKE_EVIDENCE_PAGE_OK");
        evidence.paypalScene="SMOKE_ONLY";
        return;
      }
      assert(evidence.artifactId,"LIVE_ARTIFACT_ID_MISSING");
      await page.goto(origin+"/invoice-artifacts/"+evidence.artifactId,{waitUntil:"domcontentloaded",timeout:45000});
      await page.getByRole("heading",{name:"Three short checks before payment"}).waitFor({timeout:30000});

      // Step 1: read pages + verify facts (hard asserts on API responses)
      const readBtn=page.getByRole("button",{name:"Read invoice details"});
      if(await readBtn.isVisible().catch(()=>false)){
        const pagesResp=page.waitForResponse(r=>
          /\/pdf-pages$/.test(new URL(r.url()).pathname)&&r.request().method()==="POST",
          {timeout:30000});
        await readBtn.click();
        const pgResp=await pagesResp;
        assert.equal(pgResp.status(),200,"LIVE_PDF_PAGES_FAILED");
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(500);
      const factsText=await page.locator("section[aria-label='Verify invoice details']").innerText();
      assert(factsText.includes("Northstar"),"LIVE_FACTS_VENDOR_MISSING");
      assert(factsText.includes("MG-SANDBOX-101-2026"),"LIVE_FACTS_INVOICE_MISSING");
      assert(factsText.includes("1.01"),"LIVE_FACTS_AMOUNT_MISSING");
      const reasonArea=page.locator('.invoice-review-reason textarea');
      const currentReason=await reasonArea.inputValue();
      if(currentReason.trim().length<16){
        await reasonArea.fill("Verified Northstar test invoice USD 1.01 against the original PDF source text.");
      }
      const verifyResp=page.waitForResponse(r=>
        /\/verify-pdf-facts$/.test(new URL(r.url()).pathname)&&r.request().method()==="POST",
        {timeout:30000});
      await page.getByRole("button",{name:/Verify invoice details/}).click();
      const vr=await verifyResp;
      assert.equal(vr.status(),200,"LIVE_VERIFY_FACTS_FAILED");
      await stage("Facts verified from the original PDF · confirm the supplier");
      await page.waitForTimeout(1200);

      // Step 2: confirm supplier on the pre-enrolled Sandbox test channel
      const step2Nav=page.locator('nav[aria-label="Invoice verification steps"] button').filter({hasText:"Supplier"});
      if(await step2Nav.count()>0)await step2Nav.first().click();
      await page.waitForTimeout(500);
      const refInput=page.locator('section[aria-label="Confirm invoice supplier"] input:not([type="checkbox"])').first();
      if(await refInput.count()>0){
        const val=await refInput.inputValue();
        if(val.trim().length<16){
          await refInput.fill("synthetic-fixture:northstar-sandbox-001");
        }
      }
      await page.locator('section[aria-label="Confirm invoice supplier"] input[type="checkbox"]').first().check();
      const attestResp=page.waitForResponse(r=>
        /\/origin-attestations$/.test(new URL(r.url()).pathname)&&r.request().method()==="POST",
        {timeout:30000});
      await page.getByRole("button",{name:/Confirm supplier/}).click();
      const ar=await attestResp;
      assert.equal(ar.status(),200,"LIVE_ATTEST_FAILED");
      await stage("Supplier source confirmed · run the payment checks");
      await page.waitForTimeout(1200);

      // Step 3: payment checks → frozen proposal
      const step3Nav=page.locator('nav[aria-label="Invoice verification steps"] button').filter({hasText:"Payment checks"});
      if(await step3Nav.count()>0)await step3Nav.first().click();
      await page.waitForTimeout(500);
      const proposeResp=page.waitForResponse(r=>
        /\/proposals$/.test(new URL(r.url()).pathname)&&r.request().method()==="POST",
        {timeout:30000});
      await page.getByRole("button",{name:/Run payment checks/}).click();
      const prr=await proposeResp;
      assert.equal(prr.status(),200,"LIVE_PROPOSAL_FAILED");
      const proposal=await prr.json().catch(()=>({}));
      assert(typeof proposal?.bindingId==="string","LIVE_PROPOSAL_BINDING_MISSING");
      evidence.proposalBindingId=proposal.bindingId;
      await page.getByText("Payment ready for your approval",{exact:false}).first().waitFor({timeout:15000});
      await stage("Payment frozen for approval · exact amount and recipient");
      await page.waitForTimeout(1200);
      await page.getByRole("link",{name:/Continue to payment approval/}).click();
      await page.waitForURL(url=>/^\/invoice-bindings\//.test(url.pathname),{timeout:20000});
      await page.waitForTimeout(800);

      // Prepare the canonical request (not a payment)
      const prepareResp=page.waitForResponse(r=>
        /prepare-sandbox$/.test(new URL(r.url()).pathname)&&r.request().method()==="POST",
        {timeout:30000});
      await page.getByRole("button",{name:/Prepare USD 1.01/}).click();
      const prr2=await prepareResp;
      assert.equal(prr2.status(),200,"LIVE_PREPARE_FAILED");
      const prepared=await prr2.json();
      assert(typeof prepared?.requestId==="string"&&prepared?.paymentSubmittedByThisAction===false,
        "LIVE_PREPARE_SHAPE_INVALID");
      evidence.paymentRequestId=prepared.requestId;
      await page.waitForURL(url=>/^\/payments\//.test(url.pathname),{timeout:20000});
      await page.waitForTimeout(1000);

      if(!doPayment){
        evidence.paypalScene="PREPARED_NOT_EXECUTED";
        await stage("Payment prepared · execute requires explicit authorization");
        return;
      }

      // ==== THE ONE-SHOT PAYPAL SANDBOX PAYOUT ====
      // Exactly one execute click. No retry after this point, ever.
      await stage("Approving the one-time PayPal Sandbox payout");
      const summary=page.locator("details.ops-manual-test summary").first();
      if(await summary.count()>0){
        await summary.click();
        await page.waitForTimeout(600);
      }
      const execBtn=page.getByRole("button",{name:/Pay .* with PayPal Sandbox|Execute PayPal Sandbox payout/});
      await execBtn.waitFor({timeout:10000});
      let executeResponse=null;
      try{
        const execResp=page.waitForResponse(r=>
          /\/execute$/.test(new URL(r.url()).pathname)&&r.request().method()==="POST",
          {timeout:45000});
        await execBtn.click();
        executeResponse=await execResp;
      }catch(e){
        evidence.executeOutcome="UNCERTAIN_NO_RESPONSE";
        evidence.executeError=String(e).slice(0,300);
        console.error("LIVE_EXECUTE_UNCERTAIN — read-only investigation only, no retry");
        throw Error("LIVE_EXECUTE_UNCERTAIN_NO_RETRY");
      }
      const execBody=await executeResponse.json().catch(()=>({}));
      evidence.executeStatus=executeResponse.status();
      evidence.executeBody=JSON.stringify(execBody).slice(0,1500);
      if(executeResponse.status()!==200){
        evidence.executeOutcome="REJECTED";
        console.error("LIVE_EXECUTE_REJECTED status="+executeResponse.status());
        throw Error("LIVE_EXECUTE_REJECTED_NO_RETRY");
      }
      evidence.executeOutcome="ACCEPTED";
      evidence.paypalPayoutBatchId=execBody?.execution?.paypalPayoutBatchId??null;
      evidence.paypalPayoutItemId=execBody?.execution?.paypalPayoutItemId??null;
      evidence.executionStatus=execBody?.execution?.status??null;
      await stage("Submitted to PayPal · waiting for reconciliation");

      // Read-only reconciliation poll (never resubmits).
      let reconciled=false;
      for(let attempt=1;attempt<=9;attempt++){
        await page.waitForTimeout(10000);
        await page.reload({waitUntil:"domcontentloaded",timeout:30000});
        await page.waitForTimeout(1500);
        const body=await page.locator("main").innerText();
        await page.screenshot({path:join(output,`paypal-reconcile-${attempt}.jpg`),type:"jpeg",quality:80});
        if(/SUCCESS/i.test(body)){
          reconciled=true;
          evidence.paypalPageFinal=body.slice(0,2500);
          break;
        }
      }
      evidence.paypalScene=reconciled?"LIVE_EXECUTED_RECONCILED":"LIVE_EXECUTED_RECONCILE_PENDING";
      await stage(reconciled?"PayPal confirmed · payment reconciled automatically"
        :"PayPal submission recorded · reconciliation continues");
    });

    // === SCENE 8: Business outcome ===
    await scene("08-business-outcome",20,async()=>{
      await navigate("/dashboard","Payment operations");
      await stage("AI interprets · policy authorizes · PayPal executes");
      await page.mouse.move(540,370,{steps:18});
      // Show activity
      await page.getByRole("link",{name:"Activity",exact:true}).first().hover();
      await page.waitForTimeout(1500);
    });

    recordingComplete=true;
  }finally{
    const video=page.video();
    await ctx.close();
    if(video){
      const from=await video.path();
      const {statSync,renameSync}=await import("node:fs");
      const to=join(output,"mandategate-live-demo.webm");
      renameSync(from,to);
      const length=seconds();
      const manifest={
        contract:"mandategate/live-browser-demo/v1",
        origin,recordingType:"live_interactive_application",
        finalTake,executePayout:doPayment,recordingComplete,
        captureDurationSeconds:Number(length.toFixed(2)),
        file:"mandategate-live-demo.webm",bytes:statSync(to).size,
        scenes:traces,evidence,browserErrors,
      };
      writeFileSync(join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
      console.log("LIVE_DEMO_COMPLETE duration="+length.toFixed(2)+"s scenes="+traces.length+
        " payment="+evidence.paypalScene+" errors="+browserErrors.length);
      if(recordingComplete){
        console.log("LIVE_DEMO_RECORDING_PASS");
      }else{
        console.error("LIVE_DEMO_INCOMPLETE");
      }
    }
  }
}finally{
  await browser.close();
}
