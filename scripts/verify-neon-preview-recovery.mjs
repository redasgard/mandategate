import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
async function within(promise, ms, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]); } finally { clearTimeout(timer); }
}
export function portOpen(port) {
  return new Promise((resolveResult) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (value) => { socket.destroy(); resolveResult(value); };
    socket.setTimeout(1000, () => finish(true)); // Uncertain is not closed.
    socket.once('connect', () => finish(true));
    socket.once('error', (e) => finish(e.code !== 'ECONNREFUSED'));
  });
}
function alive(child) { return child.exitCode === null && child.signalCode === null; }
function launch({ cwd, launcher, execArgv, env }) {
  const child = fork(launcher, [], { cwd, execArgv, env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const ctx = { child, pid: undefined, error: undefined };
  ctx.closed = new Promise((resolveClosed) => {
    child.once('close', (code, signal) => resolveClosed({ code, signal }));
  });
  child.on('error', () => { ctx.error = 'PREVIEW_CHILD_SPAWN_FAILED'; });
  // Do not echo application logs that might contain private data.
  child.stdout.resume();
  child.stderr.resume();
  child.on('message', (message) => {
    if (message?.type === 'preview-child' && Number.isInteger(message.pid) && message.pid > 1) {
      ctx.pid = message.pid;
    }
  });
  return ctx;
}
async function readiness(ctx, port) {
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    if (ctx.error || !alive(ctx.child)) throw new Error('PREVIEW_EXITED_BEFORE_READY');
    if (ctx.pid) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
        const value = await r.json();
        if (r.ok && value.ok === true && value.database === 'ready') return;
      } catch {}
    }
    await delay(200);
  }
  throw new Error('PREVIEW_READINESS_TIMEOUT');
}
async function stop(ctx, port) {
  assert(alive(ctx.child), 'PREVIEW_WAS_NOT_RUNNING');
  ctx.child.kill('SIGTERM');
  const exit = await within(ctx.closed, 12000, 'PREVIEW_SHUTDOWN_TIMEOUT');
  assert.equal(exit.code, 0, 'PREVIEW_DID_NOT_STOP_CLEANLY');
  assert.equal(await portOpen(port), false, 'PREVIEW_PORT_REMAINED_OPEN');
  assert(ctx.pid, 'ACTUAL_SERVER_PID_NOT_RECORDED');
  let gone = false;
  try { process.kill(ctx.pid, 0); } catch (e) { if (e.code === 'ESRCH') gone = true; }
  assert(gone, 'ACTUAL_SERVER_PROCESS_REMAINED');
}
async function cleanup(ctx) {
  if (!alive(ctx.child)) return;
  ctx.child.kill('SIGTERM');
  try { await within(ctx.closed, 12000, 'CLEANUP_TIMEOUT'); }
  catch {
    if (alive(ctx.child)) ctx.child.kill('SIGKILL');
    await within(ctx.closed, 5000, 'CLEANUP_FAILED');
    throw new Error('PREVIEW_FORCED_CLEANUP_REQUIRED');
  }
}
export async function exerciseRecovery(options) {
  const { port, env } = options;
  assert.equal(await portOpen(port), false, 'PREVIEW_PORT_ALREADY_IN_USE');
  const contexts = [];
  const result = { startupDenials: [], cycles: [] };
  try {
    for (const [name, changed] of [
      ['missing payment switch', { MANDATEGATE_DISABLE_PAYMENTS: '' }],
      ['non-Neon destination', { DATABASE_URL: 'postgresql://synthetic:synthetic@invalid.example/neondb' }],
      ['PayPal credentials present', { PAYPAL_CLIENT_SECRET: 'synthetic-forbidden-test-value' }],
    ]) {
      const ctx = launch({ ...options, env: { ...env, ...changed } });
      contexts.push(ctx);
      const exit = await within(ctx.closed, 10000, 'UNSAFE_CONFIGURATION_DID_NOT_EXIT');
      assert.notEqual(exit.code, 0, 'UNSAFE_CONFIGURATION_ACCEPTED');
      assert.equal(ctx.pid, undefined, 'UNSAFE_CONFIGURATION_STARTED_SERVER');
      assert.equal(await portOpen(port), false, 'UNSAFE_CONFIGURATION_BOUND_PORT');
      result.startupDenials.push(name);
      console.log('PASS startup refusal:', name);
    }
    for (let cycle = 1; cycle <= 2; cycle++) {
      assert.equal(await portOpen(port), false, 'OLD_SERVER_STILL_LISTENING');
      const ctx = launch(options);
      contexts.push(ctx);
      await readiness(ctx, port);
      console.log('PASS ready cycle', cycle);
      assert(alive(ctx.child), 'SUPERVISOR_EXITED_AFTER_READY');
      const r = await fetch(`http://127.0.0.1:${port}/api/paypal/webhooks`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(r.status, 503, 'WEBHOOK_NOT_DISABLED');
      const error = await r.json();
      assert.equal(error.error, 'PAYMENT_INTEGRATIONS_DISABLED_FOR_PREVIEW');
      await stop(ctx, port);
      console.log('PASS stopped cycle', cycle);
      result.cycles.push({ cycle, supervisorPid: ctx.child.pid, serverPid: ctx.pid,
        stopped: true, portClosed: true, webhookStatus: 503 });
    }
    assert.notEqual(result.cycles[0].serverPid, result.cycles[1].serverPid, 'SERVER_NOT_REPLACED');
    assert.notEqual(result.cycles[0].supervisorPid, result.cycles[1].supervisorPid, 'SUPERVISOR_NOT_REPLACED');
    return result;
  } finally {
    for (const ctx of contexts.reverse()) await cleanup(ctx);
  }
}
async function databaseFingerprint(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");
    const size = await client.query('SELECT pg_database_size(current_database())::text AS n');
    assert(BigInt(size.rows[0].n) < 268435456n, 'FIXTURE_DATABASE_TOO_LARGE_FOR_FULL_FINGERPRINT');
    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    assert(tables.rows.length >= 32, 'EXPECTED_APPLICATION_SCHEMA_MISSING');
    const manifest = [];
    for (const { table_name: name } of tables.rows) {
      const quoted = '"' + name.replaceAll('"', '""') + '"';
      const r = await client.query(`SELECT count(*)::text AS rows, md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) AS fingerprint FROM public.${quoted} AS t`);
      manifest.push({ table: name, ...r.rows[0] });
    }
    const executions = manifest.find((x) => x.table === 'payment_executions');
    assert.equal(executions?.rows, '0', 'PAYMENT_EXECUTIONS_PRESENT');
    await client.query('COMMIT');
    return { tables: manifest.length, executions: 0,
      digest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}
async function main() {
  const target = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(target.hostname, 'ep-silent-poetry-arjowm4d.c-4.us-west-2.aws.neon.tech', 'WRONG_NEON_ENDPOINT');
  assert.equal(target.pathname, '/neondb', 'WRONG_DATABASE');
  assert(['postgres:', 'postgresql:'].includes(target.protocol), 'WRONG_PROTOCOL');
  assert(target.username && target.password, 'DATABASE_CREDENTIALS_MISSING');
  for (const key of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'EXPLABS_API_KEY']) {
    assert(!process.env[key], 'EXTERNAL_PROVIDER_CREDENTIALS_FORBIDDEN');
  }
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(sha, process.env.EXPECTED_SOURCE_SHA, 'UNREVIEWED_CHECKOUT');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1, connectionTimeoutMillis: 15000 });
  try {
    const before = await databaseFingerprint(pool);
    console.log('PASS baseline fingerprint:', before.tables, 'tables; zero payment executions');
    const result = await exerciseRecovery({ cwd: process.cwd(),
      launcher: resolve('scripts/neon-preview-start.ts'), execArgv: ['--import', 'tsx'],
      port: 3109, env: { ...process.env, PORT: '3109', PREVIEW_HOST: '127.0.0.1',
        BETTER_AUTH_URL: 'http://127.0.0.1:3109', MANDATEGATE_DISABLE_PAYMENTS: '1' },
    });
    const after = await databaseFingerprint(pool);
    assert.deepEqual(after, before, 'DATABASE_CHANGED_DURING_RECOVERY');
    const lines = ['# Neon preview recovery evidence', '', `Source: ${sha}`,
      `Verified UTC: ${new Date().toISOString()}`, '',
      'PASS: unsafe startup configurations denied before server launch.',
      ...result.cycles.map((x) => `PASS: cycle ${x.cycle}; server ${x.serverPid}; supervisor ${x.supervisorPid}; confirmed exit; port closed; webhook HTTP 503.`),
      `PASS: all ${after.tables} public tables unchanged; digest ${after.digest}.`,
      'PASS: payment_executions=0 before and after.',
      'PASS: both owned server processes stopped; no persistent preview created.', '',
      'Scope: isolated GitHub Actions restart test using the existing Neon fixture database.',
      'Not proven: live Render cutover/rollback, hosted credential wiring, provider inference or a payout.', ''];
    await mkdir('out', { recursive: true });
    await writeFile('out/neon-preview-recovery.md', lines.join('\n'));
    console.log(lines.join('\n'));
  } finally { await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === here) {
  main().catch((e) => { const firstLine = String(e.message ?? '').split('\n')[0].trim(); const detail = /^[A-Z0-9_]+$/.test(firstLine) ? firstLine : (e.code ?? 'CHECK_FAILED'); console.error('NEON_RECOVERY_GATE_FAILED', detail); process.exitCode = 1; });
}
