import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatedJudgeSourceAllowlist } from './judge-source-allowlist.mjs';

const good = 'a'.repeat(64);
const other = 'b'.repeat(64);
test('strictly normalized, exact SHA allowlist is optional', () => {
  assert.equal(validatedJudgeSourceAllowlist({}), undefined);
  assert.equal(validatedJudgeSourceAllowlist({JUDGE_SYNTHETIC_SOURCE_SHAS:'   '}), undefined);
  assert.equal(validatedJudgeSourceAllowlist({JUDGE_SYNTHETIC_SOURCE_SHAS:good}),good);
  assert.equal(validatedJudgeSourceAllowlist({JUDGE_SYNTHETIC_SOURCE_SHAS:' '+good+', '+other+' '}), good+','+other);
});
for(const [name,value] of [
  ['duplicate',good+','+good],
  ['too many',[good,other,'c'.repeat(64),'d'.repeat(64)].join(',')],
  ['uppercase','A'.repeat(64)],
  ['truncated','a'.repeat(63)],
  ['delimiter',good+';'+other],
  ['embedded whitespace','a'.repeat(30)+' '+'a'.repeat(33)],
  ['bad character','x'.repeat(64)],
  ['nonstring',123],
]) test('reject invalid source allowlist: '+name,()=>{
  assert.throws(()=>validatedJudgeSourceAllowlist({JUDGE_SYNTHETIC_SOURCE_SHAS:value}),/RUNTIME_JUDGE_SOURCE_ALLOWLIST_INVALID/);
});
