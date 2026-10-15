import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeProfile, NEON_HOST, RENDER_HOST } from './runtime-profile.mjs';

const original = `postgresql://old:old@${RENDER_HOST}/mandategate_sandbox_db`;
const neon = `postgresql://fresh:fresh@${NEON_HOST}/neondb?sslmode=require`;
const env = { MANDATEGATE_RUNTIME_MODE: 'neon-preview', MANDATEGATE_DISABLE_PAYMENTS: '1',
  DATABASE_URL: original, NEON_PREVIEW_DATABASE_URL: neon,
  BETTER_AUTH_SECRET: 'local-only-test-secret-at-least-32-characters',
  BETTER_AUTH_URL: 'http://127.0.0.1:3109', PORT: '3109' };

test('legacy mode preserves the existing command path', () => {
  assert.deepEqual(runtimeProfile({ DATABASE_URL: original }), { mode: 'legacy', isolated: false });
});
test('direct Neon legacy startup is refused', () => {
  assert.throws(() => runtimeProfile({ DATABASE_URL: neon }), /NEON_REQUIRES_EXPLICIT_PREVIEW_MODE/);
});
test('verified Neon pooled endpoint is allowed and other poolers rejected', () => {
  const pooled=neon.replace(NEON_HOST, NEON_HOST.replace('arjowm4d.', 'arjowm4d-pooler.'));
  const chosen=runtimeProfile({...env, NEON_PREVIEW_DATABASE_URL:pooled});
  assert.equal(chosen.childEnv.DATABASE_URL, pooled);
  assert.throws(()=>runtimeProfile({...env, NEON_PREVIEW_DATABASE_URL:pooled.replace('arjowm4d-pooler.','evil-pooler.')}), /RUNTIME_NEON_TARGET_MISMATCH/);
});

test('Neon selection preserves original input and omits credentials from child', () => {
  const input = Object.freeze({ ...env, PAYPAL_CLIENT_SECRET: 'fake-private', EXPLABS_API_KEY: 'fake-llm',
    DEMO_AGENT_API_KEY: 'fake-agent', RUN_SLICE2_SANDBOX_PROOF: '1', RUN_DEMO_CREDENTIAL_ROTATION: '1',
    NODE_OPTIONS: '--inspect=0.0.0.0:9229', PGHOST: 'other', PGOPTIONS: 'unsafe', GITHUB_TOKEN: 'fake-token' });
  const p = runtimeProfile(input);
  assert.equal(p.childEnv.DATABASE_URL, neon);
  assert.equal(input.DATABASE_URL, original);
  assert.equal(p.childEnv.MANDATEGATE_DISABLE_PAYMENTS, '1');
  assert.equal(p.childEnv.MANDATEGATE_RUNTIME_MODE,'neon-preview');
  for (const key of ['PAYPAL_CLIENT_SECRET','EXPLABS_API_KEY','DEMO_AGENT_API_KEY','RUN_SLICE2_SANDBOX_PROOF',
    'RUN_DEMO_CREDENTIAL_ROTATION','NODE_OPTIONS','PGHOST','PGOPTIONS','NEON_PREVIEW_DATABASE_URL','GITHUB_TOKEN']) {
    assert.equal(p.childEnv[key], undefined, key);
  }
});
test('backout selection uses preserved original target without seeding or payments', () => {
  const p = runtimeProfile({ ...env, MANDATEGATE_RUNTIME_MODE: 'render-preview' });
  assert.equal(p.childEnv.DATABASE_URL, original);
  assert.equal(p.isolated, true);
  assert.equal(p.childEnv.MANDATEGATE_DISABLE_PAYMENTS, '1');
});
for (const [name, patch, error] of [
  ['typo mode', { MANDATEGATE_RUNTIME_MODE: 'neon' }, 'RUNTIME_MODE_INVALID'],
  ['no switch', { MANDATEGATE_DISABLE_PAYMENTS: undefined }, 'RUNTIME_PAYMENT_SWITCH_REQUIRED'],
  ['no Neon URL', { NEON_PREVIEW_DATABASE_URL: undefined }, 'RUNTIME_DATABASE_INVALID'],
  ['wrong Neon endpoint', { NEON_PREVIEW_DATABASE_URL: neon.replace(NEON_HOST,'evil.neon.tech') }, 'RUNTIME_NEON_TARGET_MISMATCH'],
  ['query host override', { NEON_PREVIEW_DATABASE_URL: neon + '&host=evil.example' }, 'RUNTIME_DATABASE_OPTIONS_UNSAFE'],
  ['wrong database', { NEON_PREVIEW_DATABASE_URL: neon.replace('/neondb','/other') }, 'RUNTIME_NEON_TARGET_MISMATCH'],
  ['TLS missing', { NEON_PREVIEW_DATABASE_URL: neon.replace('?sslmode=require','') }, 'RUNTIME_NEON_TLS_REQUIRED'],
  ['wrong backout endpoint', { MANDATEGATE_RUNTIME_MODE:'render-preview', DATABASE_URL: neon }, 'RUNTIME_RENDER_TARGET_MISMATCH'],
  ['wrong origin', { BETTER_AUTH_URL:'https://wrong.example' }, 'RUNTIME_AUTH_ORIGIN_INVALID'],
  ['short signing secret', { BETTER_AUTH_SECRET:'short' }, 'RUNTIME_AUTH_SECRET_REQUIRED'],
  ['wrong port', { PORT:'0' }, 'RUNTIME_PORT_INVALID'],
]) test(`refuse ${name}`, () => assert.throws(() => runtimeProfile({ ...env, ...patch }), new RegExp(error)));

test('migration and seeding skip without importing any database or auth dependency', () => {
  const script = fileURLToPath(new URL('./runtime-command.mjs', import.meta.url));
  for (const mode of ['neon-preview', 'render-preview']) {
    for (const action of ['migrate','seed']) {
      const output = execFileSync(process.execPath, [script, action], {
        env: { ...env, MANDATEGATE_RUNTIME_MODE:mode }, encoding:'utf8', timeout:5000,
      });
      assert.match(output, new RegExp(`SKIP ${action}: ${mode}`));
    }
  }
});
