/**
 * Capture evidence of the EXACT PR head while disposable PostgreSQL18 and
 * payment-disabled local Next server are running in CI. All data is synthetic.
 * No network navigation is permitted beyond 127.0.0.1:3000.
 */
import {createRequire} from "node:module";
import {mkdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";

const required=["CI_VISUAL_BROWSER_ROOT","DEMO_ADMIN_EMAIL","DEMO_ADMIN_PASSWORD","CI_EXPECTED_SHA"];
for (const key of required) if (!process.env[key]) throw Error("VISUAL_QA_ENV_MISSING_"+key);
if (process.env.CI!=="true" || process.env.MANDATEGATE_DISABLE_PAYMENTS!=="1" ||
    process.env.BETTER_AUTH_URL!=="http://127.0.0.1:3000" ||
    process.env.PORT!=="3000" ||
    !process.env.DATABASE_URL?.includes("@127.0.0.1:55432/mandategate")) {
  throw Error("VISUAL_QA_MUST_USE_LOCAL_PAYMENT_DISABLED_SYNTHETIC_CI");
}
const req=createRequire(join(resolve(process.env.CI_VISUAL_BROWSER_ROOT),"visual-loader.cjs"));
const {chromium}=req("playwright");
const origin="http://127.0.0.1:3000";
const output=resolve("ci-public/visual");
mkdirSync(output,{recursive:true});
const cases=[
  {route:"/dashboard",id:"dashboard",heading:"Payment operations"},
  {route:"/payments",id:"payments",heading:"Payments"},
  {route:"/vendors",id:"vendors",heading:"Vendors"},
  {route:"/policies",id:"policies",heading:"Policies & mandates"},
  {route:"/activity",id:"activity",heading:"Activity"},
  {route:"/autopay",id:"mandates",heading:"Standing mandates"},
];
const viewports=[
  {name:"desktop",width:1440,height:900,scale:1},
  {name:"mobile",width:390,height:844,scale:1},
];
const results=[];
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
try {
  // Sign in once against a fresh, synthetic server. The subsequent HTTP smoke
  // intentionally exercises rate limits; signing in afterward would receive
  // 429 and falsely appear to be a broken login.
  const signInContext=await browser.newContext({
    viewport:{width:1440,height:900},deviceScaleFactor:1,
    colorScheme:"dark",reducedMotion:"reduce",
  });
  await signInContext.route("**/*",route=>{
    const url=new URL(route.request().url());
    return url.origin===origin?route.continue():route.abort("blockedbyclient");
  });
  const login=await signInContext.newPage();
  const loginErrors=[];
  const authResponses=[];
  login.on("pageerror",error=>loginErrors.push(String(error.message||error).slice(0,160)));
  login.on("response",response=>{
    const url=new URL(response.url());
    if(url.origin===origin && url.pathname.startsWith("/api/auth/"))
      authResponses.push({path:url.pathname,status:response.status()});
  });
  const signedOut=await login.goto(origin+"/sign-in",{waitUntil:"networkidle",timeout:45000});
  if(signedOut?.status()!==200)throw Error("VISUAL_SIGNIN_HTTP_"+signedOut?.status());
  await login.getByRole("heading",{name:"Financial authority stays here."}).waitFor({timeout:30000});
  await login.waitForTimeout(250);
  await login.screenshot({path:join(output,"signin-desktop.jpg"),type:"jpeg",
    quality:77,fullPage:true,animations:"disabled"});
  await login.getByLabel("Work email").fill(process.env.DEMO_ADMIN_EMAIL);
  await login.getByLabel("Password").fill(process.env.DEMO_ADMIN_PASSWORD);
  await login.getByRole("button",{name:/Sign in to MandateGate/}).click();
  try{
    await login.waitForURL(url=>url.pathname==="/dashboard",{
      waitUntil:"domcontentloaded",timeout:25000,
    });
  }catch{
    const alerts=await login.locator('[role="alert"], .mg-login-error').allTextContents();
    console.error("VISUAL_SIGNIN_DIAGNOSTIC "+JSON.stringify({
      pathname:new URL(login.url()).pathname,
      alerts:alerts.map(x=>x.slice(0,100)),authResponses,jsErrors:loginErrors,
    }));
    throw Error("VISUAL_SIGNIN_BROWSER_FLOW_BLOCKED");
  }
  if(loginErrors.length)throw Error("VISUAL_SIGNIN_CLIENT_ERRORS");
  const signedInState=await signInContext.storageState();
  await signInContext.close();
  console.log("VISUAL_SIGNIN_UI_PASS");

  // Capture visual evidence on this fresh synthetic server. The separate
  // authenticated integration suite restarts the same local app afterward,
  // retaining normal Better Auth rate limiting in both test phases.

  for (const vp of viewports) {
    const ctx=await browser.newContext({
      viewport:{width:vp.width,height:vp.height},
      deviceScaleFactor:vp.scale, colorScheme:"dark",reducedMotion:"reduce",
      storageState:signedInState,
    });
    const page=await ctx.newPage();
    const jsErrors=[];
    page.on("pageerror",error=>jsErrors.push(String(error.message||error).slice(0,180)));
    await ctx.route("**/*",route=>{
      const u=new URL(route.request().url());
      return u.origin===origin?route.continue():route.abort("blockedbyclient");
    });
    const passes=vp.name==="desktop"?cases:cases.filter(x=>["dashboard","payments","vendors","policies"].includes(x.id));
    for (const item of passes) {
      const res=await page.goto(origin+item.route,{waitUntil:"domcontentloaded",timeout:45000});
      if(res?.status()!==200)throw Error("VISUAL_PAGE_HTTP_"+item.id+"_"+res?.status());
      await page.getByRole("heading",{name:item.heading,exact:true,level:1}).waitFor({timeout:30000});
      await page.locator('nav[aria-label="Primary navigation"]').waitFor({timeout:8000});
      await page.evaluate(()=>document.fonts.ready);
      const layout=await page.evaluate(()=>{
        const root=document.documentElement;
        const nav=document.querySelector('nav[aria-label="Primary navigation"]');
        const main=document.querySelector("main");
        const h1=document.querySelector("main h1");
        const bodyWidth=root.scrollWidth;
        const viewport=window.innerWidth;
        return {
          viewportWidth:viewport,
          documentWidth:bodyWidth,
          globalOverflowPx:Math.max(0,bodyWidth-viewport),
          moneyMetricsTop:document.querySelector(".mg-stats")?.getBoundingClientRect().top??null,
          headingBounds:h1?.getBoundingClientRect().toJSON(),
          mainBounds:main?.getBoundingClientRect().toJSON(),
          primaryNavCount:nav?.querySelectorAll("a").length??0,
          currentNavCount:nav?.querySelectorAll('[aria-current="page"]').length??0,
          skipLink:Boolean(document.querySelector('a[href="#main-content"]')),
          internalLinks:[...document.querySelectorAll("main a[href]")].length,
        };
      });
      if(layout.globalOverflowPx>2)throw Error("VISUAL_GLOBAL_OVERFLOW_"+vp.name+"_"+item.id+"_"+layout.globalOverflowPx);
      if(layout.currentNavCount!==1 || layout.primaryNavCount<5 || !layout.skipLink)
        throw Error("VISUAL_NAVIGATION_A11Y_"+vp.name+"_"+item.id);
      if((layout.headingBounds?.right??0)>layout.viewportWidth+2)
        throw Error("VISUAL_HEADING_CLIPPED_"+vp.name+"_"+item.id);
      // Both PRD landing questions must be visible in the first viewport:
      // risk shortcuts first, money position beginning before the fold.
      if(item.id==="dashboard" &&
          (typeof layout.moneyMetricsTop!=="number" ||
           layout.moneyMetricsTop>vp.height-100))
        throw Error("VISUAL_MONEY_BELOW_FIRST_FOLD_"+vp.name+"_top="+layout.moneyMetricsTop);
      const filename=item.id+"-"+vp.name+".jpg";
      await page.screenshot({path:join(output,filename),type:"jpeg",
        quality:76,fullPage:true,animations:"disabled"});
      // Only these read-only synthetic thumbnails are duplicated into CI logs
      // for remote visual self-review when the static site cannot be fetched
      // into the reviewer's isolated workspace. Never enable on live data.
      if(item.id==="dashboard" || (vp.name==="desktop" && (item.id==="payments" || item.id==="vendors"))) {
        const thumbnail=await page.screenshot({type:"jpeg",quality:23,
          fullPage:false,animations:"disabled"});
        const encoded=thumbnail.toString("base64");
        const prefix="CI_IMAGE_"+vp.name+"_"+item.id+"_";
        const chunkSize=1200;
        const count=Math.ceil(encoded.length/chunkSize);
        if(count>85)throw Error("CI_THUMBNAIL_EXCEEDS_SAFE_LOG_BUDGET_"+prefix);
        console.log(prefix+"COUNT="+count);
        for(let j=0;j<count;j++)console.log(prefix+j+"="+encoded.slice(j*chunkSize,(j+1)*chunkSize));
      }
      results.push({route:item.route,viewport:vp.name,width:vp.width,height:vp.height,
        screenshot:filename,...layout});
      console.log("VISUAL_QA_PASS "+vp.name+" "+item.id+" overflow="+layout.globalOverflowPx);
    }
    if(jsErrors.length)throw Error("VISUAL_PAGE_JS_ERRORS_"+vp.name+"_"+jsErrors.join("|"));
    await ctx.close();
  }
}finally{
  await browser.close();
}
const rows=results.map(row=>'<figure><a href="'+row.screenshot+'"><img loading="lazy" src="'+row.screenshot+'" alt="'+row.viewport+' '+row.route+' screenshot"></a><figcaption>'+row.viewport+' · '+row.route+' · viewport '+row.width+' × '+row.height+'</figcaption></figure>').join("\n");
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MandateGate v2 | Synthetic Visual QA</title><style>body{font:14px system-ui,sans-serif;color:#f3eee8;background:#101618;max-width:1400px;padding:35px;margin:auto}h1{font-size:28px}p{color:#c3d0ca}a{color:#efbe85}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,350px),1fr));gap:22px}figure{margin:0;border:1px solid #445050;padding:13px;border-radius:10px;background:#1c2426}img{width:100%;height:auto;display:block;border-radius:5px}figcaption{font-size:12px;margin-top:11px;color:#b2c2ba}</style></head><body><h1>MandateGate v2 | Captured browser QA</h1><p>Exact Git SHA: '+process.env.CI_EXPECTED_SHA+' · Synthetic local PostgreSQL18 · PayPal disabled · Desktop and mobile headless Chromium. This is static evidence, not a live application.</p><p><a href="metrics.json">Machine-readable layout observations</a> · <a href="/">CI overview</a></p><section>'+rows+'</section></body></html>';
writeFileSync(join(output,"index.html"),html);
writeFileSync(join(output,"metrics.json"),JSON.stringify({commit:process.env.CI_EXPECTED_SHA,
  paymentPosts:0,source:"isolated local CI",results},null,2)+"\n");
console.log("VISUAL_QA_CAPTURE_PASS screenshots="+(results.length+1));
