import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { portOpen } from './verify-neon-preview-recovery.mjs';
import { runtimeProfile } from './runtime-profile.mjs';
import pg from 'pg';

const port = 3110, base = `http://127.0.0.1:${port}`;
const env = { ...process.env, MANDATEGATE_RUNTIME_MODE:'neon-preview',
  MANDATEGATE_DISABLE_PAYMENTS:'1', PORT:String(port), PREVIEW_HOST:'127.0.0.1',
  BETTER_AUTH_URL:base, DATABASE_URL:'postgresql://unused:unused@old-source.invalid/source',
  PAYPAL_CLIENT_SECRET:'synthetic-tripwire-not-a-real-credential', RUN_DEMO_CREDENTIAL_ROTATION:'1',
  RUN_SLICE2_SANDBOX_PROOF:'1' };
let server, exitPromise, serverPid;
const proof = [];
async function fingerprint(pool) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await c.query("SET LOCAL statement_timeout = '15s'");
    const tables = await c.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name");
    assert.equal(tables.rowCount,32,'SCHEMA_TABLE_COUNT_CHANGED');
    const manifest = [];
    for (const {table_name:name} of tables.rows) {
      const table = '"'+name.replaceAll('"','""')+'"';
      const r=await c.query(`select count(*)::text as rows,md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by md5(row_to_json(t)::text)),'')) as digest from public.${table} t`);
      manifest.push({table:name,...r.rows[0]});
    }
    await c.query('COMMIT');
    return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  } catch(e) { await c.query('ROLLBACK').catch(()=>{});throw e; }
  finally {c.release();}
}
async function main() {
  const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  assert.equal(sha,process.env.EXPECTED_SOURCE_SHA,'SOURCE_MISMATCH');
  const profile=runtimeProfile(env);
  const pool=new pg.Pool({connectionString:profile.childEnv.DATABASE_URL,max:1,connectionTimeoutMillis:15000});
  try {
    const before=await fingerprint(pool);
    for(const [task,label] of [['db:migrate','migrate'],['demo:seed','seed']]) {
      const out=execFileSync('pnpm',[task],{env,encoding:'utf8',timeout:15000});
      assert(out.includes(`SKIP ${label}: neon-preview`),'BOOTSTRAP_NOT_SKIPPED');
    }
    assert.equal(await fingerprint(pool),before,'STARTUP_COMMAND_CHANGED_DATABASE');
    proof.push('PASS exact Render migration/seed commands skip with all 32 table fingerprints unchanged');
    assert.equal(await portOpen(port),false,'PORT_OCCUPIED');
    server=fork(resolve('scripts/runtime-command.mjs'),['start'],{env,stdio:['ignore','pipe','pipe','ipc']});
    server.stdout.resume(); server.stderr.resume();
    exitPromise=new Promise(done=>server.once('close',(code,signal)=>done({code,signal})));
    server.on('message',m=>{if(m?.type==='runtime-child')serverPid=m.pid;});
    const deadline=Date.now()+60000;
    let ready=false;
    while(Date.now()<deadline) {
      assert(server.exitCode===null&&server.signalCode===null,'SERVER_EXITED');
      try {const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(2000)});const j=await r.json();if(r.ok&&j.ok&&j.database==='ready'){ready=true;break;}}catch{}
      await delay(200);
    }
    assert(ready&&Number.isInteger(serverPid),'SERVER_NOT_READY');
    const webhook=await fetch(base+'/api/paypal/webhooks',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    assert.equal(webhook.status,503,'WEBHOOK_ACTIVE');
    assert.equal((await webhook.json()).error,'PAYMENT_INTEGRATIONS_DISABLED_FOR_PREVIEW');
    assert.equal(await fingerprint(pool),before,'NO_LOGIN_BOOT_CHANGED_DATABASE');
    proof.push('PASS no startup migrations, seeding, credential rotation or webhook recovery');
    const anon=await fetch(base+'/dashboard',{redirect:'manual'});
    assert([302,303,307,308].includes(anon.status),'ANONYMOUS_DASHBOARD_OPEN');
    const login=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({email:'admin@mandategate.local',password:process.env.DEMO_ADMIN_PASSWORD})});
    assert(login.ok,'HTTP_LOGIN_FAILED');
    const cookie=login.headers.get('set-cookie')?.split(';')[0];assert(cookie,'SESSION_COOKIE_MISSING');
    const dashboard=await fetch(base+'/dashboard',{headers:{cookie},redirect:'manual'});
    assert.equal(dashboard.status,200,'DASHBOARD_FAILED');
    proof.push('PASS administrator HTTP login and guarded dashboard using existing Neon credentials');
    async function post(path,key) {return fetch(base+path,{method:'POST',headers:{authorization:key?'Bearer '+key:'','content-type':'application/json'},body:'{}'});}
    const invoice=process.env.DEMO_AGENT_API_KEY,payment=process.env.DEMO_PAYMENT_AGENT_API_KEY;
    assert(invoice&&payment&&invoice!==payment,'AGENT_KEYS_INVALID');
    for(const [path,key,status] of [
      ['/api/agent/payment-requests',null,401],['/api/agent/payment-requests',invoice,401],
      ['/api/agent/invoice-artifacts',payment,401],['/api/agent/payment-requests',payment,400],
    ]) assert.equal((await post(path,key)).status,status,'HTTP_SCOPE_CHECK_FAILED');
    proof.push('PASS HTTP agent permission separation without submitting a valid payment request');
    const payout=await pool.query('select count(*)::int as n from payment_executions');
    assert.equal(payout.rows[0].n,0,'PAYMENT_EXECUTION_PRESENT');
    server.kill('SIGTERM');
    const deadlineClose=Date.now()+12000;
    while(server.exitCode===null&&server.signalCode===null&&Date.now()<deadlineClose)await delay(100);
    assert(server.exitCode!==null||server.signalCode!==null,'SERVER_SHUTDOWN_TIMEOUT');
    const ended=await exitPromise;assert.equal(ended.code,0,'SERVER_SHUTDOWN_FAILED');
    assert.equal(await portOpen(port),false,'SERVER_PORT_OPEN');
    let gone=false;try{process.kill(serverPid,0);}catch(e){if(e.code==='ESRCH')gone=true;}assert(gone,'SERVER_PROCESS_REMAINED');
    proof.push('PASS zero payment executions and confirmed server shutdown');
    await mkdir('out',{recursive:true});
    const text=['# Runtime startup gate',`Source: ${sha}`,`UTC: ${new Date().toISOString()}`,...proof,'Scope: CI application connected to Neon, not a live Render cutover.','Login creates a session; unchanged-table proof applies to startup before login.',''].join('\n');
    await writeFile('out/runtime-startup.md',text);console.log(text);
  } finally {
    if(server&&server.exitCode===null&&server.signalCode===null) {
      server.kill('SIGTERM');
      const until=Date.now()+10000;while(server.exitCode===null&&server.signalCode===null&&Date.now()<until)await delay(100);
      if(server.exitCode===null&&server.signalCode===null)server.kill('SIGKILL');
    }
    await pool.end();
  }
}
main().catch(e=>{const first=String(e.message??'').split('\n')[0];console.error('RUNTIME_GATE_FAILED',/^[A-Z_]+$/.test(first)?first:'CHECK_FAILED');process.exitCode=1;});
