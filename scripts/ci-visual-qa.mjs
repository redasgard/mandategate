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
  for (const vp of viewports) {
    const ctx=await browser.newContext({
      viewport:{width:vp.width,height:vp.height},
      deviceScaleFactor:vp.scale, colorScheme:"dark",reducedMotion:"reduce",
    });
    const page=await ctx.newPage();
    const jsErrors=[];
    const authResponses=[];
    page.on("pageerror",error=>jsErrors.push(String(error.message||error).slice(0,180)));
    page.on("response",response=>{
      const url=new URL(response.url());
      if(url.origin===origin && url.pathname.startsWith("/api/auth/"))
        authResponses.push({path:url.pathname,status:response.status()});
    });
    // Deny external images, scripts, pixels, providers and favicon downloads.
    await ctx.route("**/*",async route=>{
      const u=new URL(route.request().url());
      if(u.origin!==origin) return route.abort("blockedbyclient");
      return route.continue();
    });
    const signedOut=await page.goto(origin+"/sign-in",{waitUntil:"domcontentloaded",timeout:45000});
    if(signedOut?.status()!==200)throw Error("VISUAL_SIGNIN_HTTP_"+signedOut?.status());
    await page.getByRole("heading",{name:"Financial authority stays here."}).waitFor({timeout:30000});
    // SSR markup can be interactive-looking before the React event handler
    // is hydrated. A premature click gives a false login failure.
    await page.waitForLoadState("networkidle",{timeout:25000});
    await page.waitForTimeout(250);
    if(vp.name==="desktop") {
      await page.screenshot({path:join(output,"signin-desktop.jpg"),type:"jpeg",
        quality:77,fullPage:true,animations:"disabled"});
    }
    await page.getByLabel("Work email").fill(process.env.DEMO_ADMIN_EMAIL);
    await page.getByLabel("Password").fill(process.env.DEMO_ADMIN_PASSWORD);
    await page.getByRole("button",{name:/Sign in to MandateGate/}).click();
    try {
      await page.waitForURL(url=>url.pathname==="/dashboard",{
        waitUntil:"domcontentloaded",timeout:25000,
      });
    } catch {
      const alerts=await page.locator('[role="alert"], .mg-login-error').allTextContents();
      const button=await page.locator('button[type="submit"]').allTextContents();
      console.error("VISUAL_SIGNIN_DIAGNOSTIC "+JSON.stringify({
        viewport:vp.name,pathname:new URL(page.url()).pathname,
        alerts:alerts.map(x=>x.slice(0,100)),button:button.map(x=>x.slice(0,80)),
        authResponses,jsErrors,
      }));
      throw Error("VISUAL_SIGNIN_BROWSER_FLOW_BLOCKED");
    }
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
      const filename=item.id+"-"+vp.name+".jpg";
      await page.screenshot({path:join(output,filename),type:"jpeg",
        quality:76,fullPage:true,animations:"disabled"});
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
