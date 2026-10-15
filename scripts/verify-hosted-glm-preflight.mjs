import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const BASE='https://mandategate-web.onrender.com';
async function request(path,options={}) {
  return fetch(BASE+path,{...options,redirect:'manual',signal:AbortSignal.timeout(45000)});
}
async function main(){
  assert(process.env.DEMO_ADMIN_PASSWORD,'ADMIN_CREDENTIAL_MISSING');
  const kill=await request('/api/paypal/webhooks',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(kill.status,503,'PAYMENT_ISOLATION_REQUIRED');
  assert.equal((await kill.json()).error,'PAYMENT_INTEGRATIONS_DISABLED_FOR_PREVIEW');
  const login=await request('/api/auth/sign-in/email',{method:'POST',headers:{origin:BASE,'content-type':'application/json'},
    body:JSON.stringify({email:'admin@mandategate.local',password:process.env.DEMO_ADMIN_PASSWORD})});
  assert.equal(login.status,200,'ADMIN_LOGIN_FAILED');
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  assert(cookie,'SESSION_MISSING');
  const response=await request('/api/admin/experiential-privacy',{headers:{cookie}});
  assert([200,503].includes(response.status),'PREFLIGHT_ENDPOINT_FAILED');
  const body=await response.json();
  const verdict=response.status===200?'PASS':'BLOCK';
  assert.equal(body.privacyPreflight,verdict,'PREFLIGHT_STATUS_INVALID');
  if(verdict==='PASS'){
    assert.equal(body.invoiceContentSubmitted,false);
    assert.equal(body.providerServedInferenceProven,false);
    assert.equal(body.receipt?.targetModel,'glm-5.3-flash');
  }
  const error=verdict==='BLOCK'&&typeof body.error==='string'&&/^[A-Z0-9_]+$/.test(body.error)?body.error:'none';
  const result={checkedAt:new Date().toISOString(),privacyPreflight:verdict,error,
    hostedAdminLogin:true,paymentsDisabled:true,invoiceContentSubmitted:false,inferenceProven:false};
  await mkdir('out',{recursive:true});
  await writeFile('out/glm-preflight.json',JSON.stringify(result,null,2));
  const summary=['# Hosted GLM preflight',`UTC: ${result.checkedAt}`,`Privacy gate: ${verdict}`,
    `Reason: ${error}`,'Hosted admin login and disabled payment boundary checked.',
    'No invoice bytes, inference request, or payout was submitted. A captured BLOCK is not a passing GLM gate.',''].join('\n');
  await writeFile('out/glm-preflight.md',summary);
  console.log(summary);
}
main().catch(error=>{const label=String(error.message??'').split('\n')[0];
  console.error('HOSTED_GLM_PREFLIGHT_CAPTURE_FAILED',/^[A-Z0-9_]+$/.test(label)?label:'CHECK_FAILED');process.exitCode=1;});
