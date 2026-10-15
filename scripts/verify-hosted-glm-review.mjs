import assert from "node:assert/strict";
const BASE="https://mandategate-web.onrender.com";
const ID="5b4537c7-3bf7-4884-95b9-fd321015ccf1";
const PASSWORD=process.env.DEMO_ADMIN_PASSWORD;
assert(PASSWORD && PASSWORD.length>=12,"DEMO_ADMIN_PASSWORD_MISSING");
const request=async(path,options={},timeout=55000)=>fetch(BASE+path,{
  ...options,redirect:"manual",signal:AbortSignal.timeout(timeout),
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function healthy(){
  for(let i=0;i<5;i++){
    try{
      const r=await request("/api/health");
      if(r.status===200&&(await r.json()).database==="ready")return;
    }catch{}
    await pause(5000);
  }
  throw Error("HOSTED_NEON_HEALTH_NOT_READY");
}
await healthy();
const disabled=await request("/api/paypal/webhooks",{method:"POST",
  headers:{"content-type":"application/json"},body:"{}"});
assert.equal(disabled.status,503,"PAYPAL_PREVIEW_SWITCH_REQUIRED");
assert.equal((await disabled.json()).error,"PAYMENT_INTEGRATIONS_DISABLED_FOR_PREVIEW");

const auth=await request("/api/auth/sign-in/email",{method:"POST",
  headers:{origin:BASE,"content-type":"application/json"},
  body:JSON.stringify({email:"admin@mandategate.local",password:PASSWORD}),
});
assert.equal(auth.status,200,"HOSTED_ADMIN_AUTH_REQUIRED");
const cookie=auth.headers.get("set-cookie")?.split(";")[0];
assert(cookie?.includes("="),"HOSTED_SESSION_COOKIE_REQUIRED");

const expected=[
  "What GLM observed in this invoice",
  "Northstar Components",
  "DEMO-GLM-004",
  "125.00",
  "fictional-payee@synthetic.invalid",
  "Model-proposed source quotations",
  "invoice-vision-observer-v2",
  "SYNTHETIC_NON_ZDR_TEST_ONLY",
  "No payment",
];
let found=false;
for(let i=0;i<50;i++){
  const page=await request("/invoice-artifacts/"+ID,{headers:{cookie}});
  if(page.status===200){
    const html=await page.text();
    if(html.includes("What GLM observed in this invoice")){
      const checks=Object.fromEntries(expected.map(s=>[s,html.includes(s)]));
      for(const [name,ok] of Object.entries(checks)) {
        if(!ok){console.log("BLOCK hosted review marker: "+name);process.exit(1);}
      }
      assert(!html.includes("Accept and execute PayPal Sandbox"),"GLM_VIEW_EXPOSES_PAYOUT_AUTHORITY");
      console.log("PASS persisted GLM fields, risk reasons, versioned prompt and safe reviewer UI");
      console.log("PASS authenticated page; zero payout API calls");
      found=true;
      break;
    }
  }else if(page.status===401||page.status===403){
    throw Error("HOSTED_REVIEW_AUTH_REJECTED");
  }
  await pause(7000);
}
assert(found,"HOSTED_REVIEW_NOT_DEPLOYED");
