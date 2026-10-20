import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceAiEnvironment } from './invoice-ai-env.mjs';
const base = { MANDATEGATE_ENABLE_INVOICE_AI:'1', MANDATEGATE_DISABLE_PAYMENTS:'1',
  RENDER_SERVICE_ID:'srv-db39vmm7bikc73c55nh0', EXPLABS_API_KEY:'synthetic-not-a-live-api-key' };
test('AI opt-in forwards only the existing invoice provider key', () => {
  const env = Object.freeze({ ...base, PAYPAL_CLIENT_SECRET:'forbidden', PAYPAL_CLIENT_ID:'forbidden',
    PAYPAL_WEBHOOK_ID:'forbidden', DEMO_ADMIN_PASSWORD:'forbidden', NODE_OPTIONS:'--inspect',
    GITHUB_TOKEN:'forbidden', EXPLABS_BASE_URL:'https://attacker.invalid',
    MANDATEGATE_SYNTHETIC_NON_ZDR_TEST:'1' });
  assert.deepEqual(invoiceAiEnvironment(env,'neon-preview'),{
    MANDATEGATE_ENABLE_INVOICE_AI:'1',EXPLABS_API_KEY:base.EXPLABS_API_KEY });
});
for (const [label,env,mode] of [
  ['no opt-in',{...base,MANDATEGATE_ENABLE_INVOICE_AI:undefined},'neon-preview'],
  ['bad opt-in',{...base,MANDATEGATE_ENABLE_INVOICE_AI:'true'},'neon-preview'],
  ['payments on',{...base,MANDATEGATE_DISABLE_PAYMENTS:'0'},'neon-preview'],
  ['different service',{...base,RENDER_SERVICE_ID:'other'},'neon-preview'],
  ['backout',base,'render-preview'],['legacy',base,'legacy'],
]) test('provider key stays isolated: '+label,()=>assert.deepEqual(invoiceAiEnvironment(env,mode),{}));
test('missing or malformed key does not prevent unrelated demo startup',()=>{
  for(const key of [undefined,'','bad key','x'.repeat(4097)]) {
    assert.deepEqual(invoiceAiEnvironment({...base,EXPLABS_API_KEY:key},'neon-preview'),{
      MANDATEGATE_ENABLE_INVOICE_AI:'1' });
  }
});
const synthetic = {...base,MANDATEGATE_DEPLOYMENT_ROLE:'demo',MANDATEGATE_SYNTHETIC_NON_ZDR_TEST:'1',
  PAYPAL_BASE_URL:'https://api-m.sandbox.paypal.com',
  MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST:'a'.repeat(64)};
test('existing valid synthetic exception is preserved without payment credentials',()=>{
  const result=invoiceAiEnvironment(synthetic,'neon-preview');
  assert.equal(result.MANDATEGATE_SYNTHETIC_NON_ZDR_TEST,'1');
  assert.equal(result.MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST,'a'.repeat(64));
  assert.equal(result.PAYPAL_BASE_URL,'https://api-m.sandbox.paypal.com');
  assert.equal(result.PAYPAL_CLIENT_SECRET,undefined);
});
test('invalid synthetic configuration cannot relax the strict route',()=>{
  for(const patch of [{PAYPAL_BASE_URL:'https://api-m.paypal.com'},
    {MANDATEGATE_DEPLOYMENT_ROLE:'production'},
    {MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST:''},
    {MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST:'arbitrary'},
    {MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST:Array(21).fill('a'.repeat(64)).join(',')}]) {
    const result=invoiceAiEnvironment({...synthetic,...patch},'neon-preview');
    assert.equal(result.EXPLABS_API_KEY,base.EXPLABS_API_KEY);
    assert.equal(result.MANDATEGATE_SYNTHETIC_NON_ZDR_TEST,undefined);
  }
});


test('the PayPal Hackathon host can disable ZDR checks for ordinary invoice analysis',()=>{
  const env={...base,
    MANDATEGATE_REQUIRE_ZDR:'0',MANDATEGATE_DISABLE_PAYMENTS:'0',
    PAYPAL_BASE_URL:'https://api-m.sandbox.paypal.com',
  };
  const allowed=invoiceAiEnvironment(env,'neon-sandbox');
  assert.deepEqual(allowed,{
    MANDATEGATE_ENABLE_INVOICE_AI:'1',
    MANDATEGATE_REQUIRE_ZDR:'0',
    EXPLABS_API_KEY:base.EXPLABS_API_KEY,
  });
  for(const [patch,mode] of [
    [{RENDER_SERVICE_ID:'srv-other'},'neon-sandbox'],
    [{PAYPAL_BASE_URL:'https://api-m.paypal.com'},'neon-sandbox'],
    [{MANDATEGATE_DISABLE_PAYMENTS:'1'},'neon-sandbox'],
    [{},'neon-preview'],
    [{MANDATEGATE_REQUIRE_ZDR:'1'},'neon-sandbox'],
  ]){
    const result=invoiceAiEnvironment({...env,...patch},mode);
    assert.equal(result.MANDATEGATE_REQUIRE_ZDR,undefined);
  }
});
