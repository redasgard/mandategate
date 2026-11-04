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

const doPayment=env.LIVE_PAYOUT==="1";
const skipPayment=env.NO_PAYOUT==="1";
if(doPayment&&skipPayment)throw Error("Cannot set both LIVE_PAYOUT=1 and NO_PAYOUT=1");

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
      await stage("Upload invoice PDF · preserve original source evidence");
      // Download the Northstar test PDF
      const pdfResponse=await page.evaluate(async(o)=>{
        const r=await fetch(o+"/api/admin/sandbox-invoice-fixture",{credentials:"include"});
        if(!r.ok)return null;
        const buf=await r.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      },origin);
      assert(pdfResponse&&pdfResponse.length>1000,"LIVE_PDF_DOWNLOAD_FAILED");
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
      evidence.artifactId=stored?.id;
      evidence.artifactSha256=stored?.sha256;
      evidence.trustState=stored?.trustState;

      await page.waitForURL(url=>/^\/invoice-artifacts\/[a-f0-9-]{36}$/.test(url.pathname),{timeout:30000});
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

      // Show GLM archive
      await navigate("/demo","Three decisions");
      const earlier=page.locator("#demo-historical-glm");
      await scrollTo(earlier);
      await stage("AI detected suspicious instructions in a prior invoice");
    });

    // === SCENE 3: Agent submits three requests ===
    await scene("03-agent-submits-requests",17,async()=>{
      await navigate("/demo","Three decisions");
      await stage("An operations agent submits 3 requests for the same supplier");
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
        .first().waitFor({timeout:25000});
      for(const item of expected){
        const card=page.locator("#demo-decisions article.risk-evidence-card")
          .filter({hasText:item.title});
        await card.getByText("Observed outcome: "+item.result,{exact:false}).waitFor();
      }
      await scrollTo(page.locator("#demo-decisions"));
      await stage("Actual policy results: ALLOW · ESCALATE · DENY");
    });

    // === SCENE 4: ALLOW detail ===
    await scene("04-allow-trusted-payment",16,async()=>detail(expected[0]));

    // === SCENE 5: ESCALATE + human DECLINE ===
    await scene("05-escalation-human-review",23,async()=>{
      await detail(expected[1]);
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
      evidence.declineReviewId=result?.review?.reviewId;
      evidence.declineRequestId=result?.review?.requestId;
      await stage("Human review: declined with a reason · no payout");
    });

    // === SCENE 6: DENY detail ===
    await scene("06-deny-changed-recipient",14,async()=>detail(expected[2]));

    // === SCENE 7: Invoice-derived PayPal Sandbox flow ===
    await scene("07-paypal-sandbox-live",skipPayment?12:30,async()=>{
      if(skipPayment){
        // Show the archived evidence page instead
        await navigate("/sandbox-evidence","PayPal Sandbox integration evidence");
        const proof=page.getByText("SUCCESS (historical)",{exact:false}).first();
        await scrollTo(proof);
        await stage("PayPal Sandbox integration · SUCCESS + verified webhook");
        evidence.paypalScene="ARCHIVED_EVIDENCE";
      }else{
        // Navigate to invoice-artifacts list, find the uploaded artifact
        const artifactUrl="/invoice-artifacts/"+evidence.artifactId;
        await page.goto(origin+artifactUrl,{waitUntil:"domcontentloaded",timeout:45000});
        await page.getByRole("heading",{name:"Three short checks before payment"}).waitFor({timeout:30000});

        // Step 1: Read + verify invoice details
        const readBtn=page.getByRole("button",{name:"Read invoice details"});
        if(await readBtn.isVisible()){
          await readBtn.click();
          await page.waitForTimeout(2000);
        }
        const verifyBtn=page.getByRole("button",{name:/Verify invoice details/});
        if(await verifyBtn.isVisible()&&await verifyBtn.isEnabled()){
          // Fill reason if empty
          const reasonArea=page.locator('.invoice-review-reason textarea');
          const currentReason=await reasonArea.inputValue();
          if(currentReason.trim().length<16){
            await reasonArea.fill("Verified Northstar test invoice USD 1.01 against original PDF source.");
          }
          await verifyBtn.click();
          await page.waitForTimeout(1500);
        }
        await stage("Invoice details verified · supplier next");

        // Step 2: Confirm supplier
        const step2=page.locator('button').filter({hasText:"Supplier"});
        if(await step2.count()>0)await step2.first().click();
        await page.waitForTimeout(500);
        // Fill evidence reference if needed
        const refInput=page.locator('section[aria-label="Confirm invoice supplier"] input');
        if(await refInput.count()>0){
          const val=await refInput.first().inputValue();
          if(val.trim().length<16){
            await refInput.first().fill("synthetic-fixture:northstar-sandbox-001");
          }
        }
        // Check the confirmation checkbox
        const confirmBox=page.locator('section[aria-label="Confirm invoice supplier"] input[type="checkbox"]');
        if(await confirmBox.count()>0&&!(await confirmBox.first().isChecked())){
          await confirmBox.first().check();
        }
        const confirmBtn=page.getByRole("button",{name:/Confirm supplier/});
        if(await confirmBtn.isVisible()&&await confirmBtn.isEnabled()){
          await confirmBtn.click();
          await page.waitForTimeout(1500);
        }
        await stage("Supplier confirmed · payment check next");

        // Step 3: Run payment checks → get binding
        const step3=page.locator('button').filter({hasText:"Payment checks"});
        if(await step3.count()>0)await step3.first().click();
        await page.waitForTimeout(500);
        const checkBtn=page.getByRole("button",{name:/Run payment checks/});
        if(await checkBtn.isVisible()&&await checkBtn.isEnabled()){
          await checkBtn.click();
          await page.waitForTimeout(3000);
        }
        // Follow to binding page
        const continueLink=page.getByRole("link",{name:/Continue to payment approval/});
        if(await continueLink.isVisible()){
          await continueLink.click();
          await page.waitForURL(url=>/^\/invoice-bindings\//.test(url.pathname),{timeout:20000});
        }
        await stage("Payment authorized · preparing Sandbox payout");

        // Prepare (does not pay)
        const prepareBtn=page.getByRole("button",{name:/Prepare USD 1.01/});
        if(await prepareBtn.isVisible()){
          await prepareBtn.click();
          await page.waitForURL(url=>/^\/payments\//.test(url.pathname),{timeout:20000});
        }

        if(doPayment){
          // Actually execute the PayPal Sandbox payout — ONE SHOT
          await page.waitForTimeout(1000);
          const execDetails=page.locator('details summary').filter({hasText:/Manual Sandbox/});
          if(await execDetails.count()>0)await execDetails.first().click();
          const execBtn=page.getByRole("button",{name:/Execute PayPal Sandbox payout|Pay.*PayPal Sandbox/});
          await execBtn.waitFor({timeout:10000});
          await stage("Submitting to PayPal Sandbox · one-shot payout");
          await execBtn.click();
          // Wait for the execution response
          await page.waitForTimeout(8000);
          // Capture execution evidence from page
          const paypalText=await page.locator("main").innerText();
          evidence.paypalPageContents=paypalText.slice(0,2000);
          evidence.paypalScene="LIVE_EXECUTED";
          await stage("PayPal Sandbox payout submitted · reconciling");
          await page.waitForTimeout(3000);
          // Reload to see reconciled state
          await page.reload({waitUntil:"domcontentloaded",timeout:30000});
          await page.waitForTimeout(2000);
        }else{
          evidence.paypalScene="PREPARED_NOT_EXECUTED";
          await stage("Payment prepared · awaiting owner Execute authorization");
        }
      }
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
        doPayment,skipPayment,recordingComplete,
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
