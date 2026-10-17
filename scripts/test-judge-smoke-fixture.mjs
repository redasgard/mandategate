import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./verify-judge-hosted.mjs',import.meta.url));
const requests=[];
let sessionValid=false;
const expected={normal:['ALLOW','WITHIN_TRUSTED_BASELINE'],anomaly:['ESCALATE','AMOUNT_OUTSIDE_VENDOR_BASELINE'],substitution:['DENY','DESTINATION_MISMATCH']};
const fixtureId='11111111-1111-4111-8111-111111111111';
const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost');
  requests.push({method:req.method,path:path.pathname,caseId:path.searchParams.get('case')});
  const respond=(status,json,headers={})=>{res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(json))};
  if(path.pathname==='/api/health') return respond(200,{ok:true});
  if(path.pathname==='/api/auth/sign-in/email' && req.method==='POST') {
    let body='';for await(const chunk of req)body+=chunk;
    assert(JSON.parse(body).password.length>=24);
    sessionValid=true;
    return respond(200,{ok:true},{'set-cookie':[
      'csrf-token=decoy-before-session; Path=/; HttpOnly',
      '__Secure-better-auth.session_token=ci-token; Path=/; HttpOnly; Secure',
    ]});
  }
  if(path.pathname==='/api/auth/sign-out' && req.method==='POST') {
    assert.equal(req.headers.cookie,'__Secure-better-auth.session_token=ci-token',
      'Wrong login cookie selected');sessionValid=false;return respond(200,{success:true});
  }
  if(path.pathname==='/judge' && (!req.headers.cookie || !sessionValid)){res.writeHead(307,{location:'/sign-in?returnTo=%2Fjudge'});return res.end()}
  if(path.pathname==='/judge' && req.headers.cookie && sessionValid){res.writeHead(200,{'content-type':'text/html'});return res.end('judge-only synthetic sandbox; Model observations, not authorization; Recorded earlier PayPal Sandbox payout')}
  if(path.pathname==='/dashboard' && sessionValid){
    res.writeHead(307,{location:'/judge'});return res.end();
  }
  if(path.pathname==='/demo')return respond(404,{error:'NOT_FOUND'});
  if(path.pathname==='/api/admin/experiential-privacy')return respond(403,{error:'REVIEWER_ADMIN_MEMBERSHIP_REQUIRED'});
  if(path.pathname==='/payments/'+fixtureId||path.pathname==='/api/admin/invoice-artifacts/'+fixtureId+'/source')return respond(404,{error:'NOT_FOUND'});
  if(path.pathname==='/api/judge/scenario') {
    if(!sessionValid)return respond(401,{error:'UNAUTHORIZED'});
    const c=path.searchParams.get('case');
    if(!(c in expected))return respond(404,{error:'JUDGE_CASE_NOT_FOUND'});
    const [outcome,reason]=expected[c];
    return respond(200,{id:c,outcome,reasonCodes:[reason],proofClass:'DETERMINISTIC_POLICY_SIMULATION',noPaymentPerformed:true,noPaymentStateMutation:true,aiInvoiceDerived:false},{'cache-control':'private, no-store'});
  }
  return respond(500,{error:'UNEXPECTED_ENDPOINT'});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const result=await new Promise(resolve=>{
  const p=spawn(process.execPath,[script],{
    env:{...process.env,JUDGE_SMOKE_APPROVED:'YES',JUDGE_DEMO_BASE_URL:`http://127.0.0.1:${port}`,JUDGE_DEMO_EMAIL:'judge@example.invalid',JUDGE_DEMO_PASSWORD:'x'.repeat(32),JUDGE_PROBE_PAYMENT_ID:fixtureId,JUDGE_PROBE_ARTIFACT_ID:fixtureId}
  });
  let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);
  p.on('close',code=>resolve({code,out,err}));
});
server.close();
assert.equal(result.code,0,result.err);
assert(result.out.includes('JUDGE_SMOKE_READONLY_PASS'));
assert.equal(requests.filter(x=>x.method==='POST').length,2);
assert.deepEqual(requests.filter(x=>x.method==='POST').map(x=>x.path),['/api/auth/sign-in/email','/api/auth/sign-out']);
assert.equal(requests.filter(x=>x.path==='/api/judge/scenario' && x.caseId!=='nonexistent').length,7); // includes revoked-session denial probe
console.log(result.out.trim());
const rejected=await new Promise(resolve=>{
 const p=spawn(process.execPath,[script],{env:{...process.env,JUDGE_SMOKE_APPROVED:'YES',JUDGE_DEMO_BASE_URL:'https://attacker.example',JUDGE_DEMO_EMAIL:'judge@example.invalid',JUDGE_DEMO_PASSWORD:'x'.repeat(32)}});
 let err='';p.stderr.on('data',x=>err+=x);p.on('close',code=>resolve({code,err}));
});
assert.notEqual(rejected.code,0,'malicious URL unexpectedly accepted');
assert.match(rejected.err,/JUDGE_BASE_URL_NOT_ALLOWLISTED/);
assert.equal(requests.length,19,'foreign-host rejection unexpectedly issued HTTP request');
console.log('FIXTURE_SMOKE_PASS requests='+requests.length+' payment_posts=0 foreign_host=REJECTED');
