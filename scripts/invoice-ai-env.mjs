/** Narrowly forward invoice-AI configuration, never payment credentials. */
const SERVICE = 'srv-db39vmm7bikc73c55nh0';
const SANDBOX = 'https://api-m.sandbox.paypal.com';
export function invoiceAiEnvironment(env, mode) {
  if (mode !== 'neon-preview' || env.MANDATEGATE_ENABLE_INVOICE_AI !== '1' ||
      env.MANDATEGATE_DISABLE_PAYMENTS !== '1' || env.RENDER_SERVICE_ID !== SERVICE) return {};
  const result = { MANDATEGATE_ENABLE_INVOICE_AI: '1' };
  const key = env.EXPLABS_API_KEY;
  if (typeof key === 'string' && key.length > 0 && key.length <= 4096 && !/\s/.test(key)) {
    result.EXPLABS_API_KEY = key;
  }
  // Preserve, but never invent, an operator's separately configured exception.
  const hashes = (env.MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST ?? '')
    .split(',').map(value => value.trim());
  if (env.MANDATEGATE_DEPLOYMENT_ROLE === 'demo' &&
      env.MANDATEGATE_SYNTHETIC_NON_ZDR_TEST === '1' &&
      env.PAYPAL_BASE_URL === SANDBOX && hashes.length >= 1 && hashes.length <= 20 &&
      hashes.every(value => /^[a-f0-9]{64}$/.test(value))) {
    Object.assign(result, {
      MANDATEGATE_DEPLOYMENT_ROLE: 'demo', MANDATEGATE_SYNTHETIC_NON_ZDR_TEST: '1',
      MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST: [...new Set(hashes)].join(','),
      PAYPAL_BASE_URL: SANDBOX,
    });
  }
  return result;
}
