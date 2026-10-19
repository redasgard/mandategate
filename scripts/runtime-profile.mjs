/** A reversible, isolated runtime selection. Never edits process.env. */
import { invoiceAiEnvironment } from './invoice-ai-env.mjs';
import { validatedJudgeSourceAllowlist } from './judge-source-allowlist.mjs';
export const NEON_HOST = 'ep-silent-poetry-arjowm4d.c-4.us-west-2.aws.neon.tech';
export const RENDER_HOST = 'dpg-db39d5rbc2fs73d1ke70-a';
const modes = new Set(['legacy', 'neon-preview', 'neon-sandbox', 'render-preview']);
const passthrough = ['PATH', 'HOME', 'LANG', 'TZ', 'TMPDIR', 'NODE_ENV',
  'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL', 'RENDER_GIT_COMMIT'];
function parseDatabase(value) {
  let url;
  try { url = new URL(value ?? ''); } catch { throw Error('RUNTIME_DATABASE_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password ||
      (url.port && url.port !== '5432') || url.hash) throw Error('RUNTIME_DATABASE_INVALID');
  for (const key of url.searchParams.keys()) {
    if (!['sslmode', 'channel_binding'].includes(key)) throw Error('RUNTIME_DATABASE_OPTIONS_UNSAFE');
  }
  return url;
}
export function runtimeProfile(env) {
  const mode = env.MANDATEGATE_RUNTIME_MODE ?? 'legacy';
  if (!modes.has(mode)) throw Error('RUNTIME_MODE_INVALID');
  if (mode === 'legacy') {
    if (env.DATABASE_URL) {
      let u;
      try { u = new URL(env.DATABASE_URL); } catch { throw Error('RUNTIME_DATABASE_INVALID'); }
      if (u.hostname.endsWith('.neon.tech')) throw Error('NEON_REQUIRES_EXPLICIT_PREVIEW_MODE');
    }
    return { mode, isolated: false };
  }
  // The one payment-capable mode is explicit. Every other preview retains its
  // global kill switch. No shortcut through the broad legacy environment.
  if (mode !== 'neon-sandbox' && env.MANDATEGATE_DISABLE_PAYMENTS !== '1')
    throw Error('RUNTIME_PAYMENT_SWITCH_REQUIRED');
  if (mode === 'neon-sandbox' && !['0','1'].includes(env.MANDATEGATE_DISABLE_PAYMENTS))
    throw Error('RUNTIME_PAYMENT_SWITCH_REQUIRED');
  const neonMode = mode === 'neon-preview' || mode === 'neon-sandbox';
  const value = neonMode ? env.NEON_PREVIEW_DATABASE_URL : env.DATABASE_URL;
  const url = parseDatabase(value);
  if (neonMode) {
    if (![NEON_HOST, NEON_HOST.replace('arjowm4d.', 'arjowm4d-pooler.')].includes(url.hostname) || url.pathname !== '/neondb') throw Error('RUNTIME_NEON_TARGET_MISMATCH');
    if (!['require', 'verify-full', 'verify-ca'].includes(url.searchParams.get('sslmode'))) {
      throw Error('RUNTIME_NEON_TLS_REQUIRED');
    }
  } else if (![RENDER_HOST, `${RENDER_HOST}.oregon-postgres.render.com`].includes(url.hostname) ||
             url.pathname !== '/mandategate_sandbox_db') {
    throw Error('RUNTIME_RENDER_TARGET_MISMATCH');
  }
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw Error('RUNTIME_AUTH_SECRET_REQUIRED');
  let auth;
  try { auth = new URL(env.BETTER_AUTH_URL ?? ''); } catch { throw Error('RUNTIME_AUTH_ORIGIN_INVALID'); }
  const local = auth.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(auth.hostname);
  const hosted = auth.origin === 'https://mandategate-web.onrender.com';
  if ((!local && !hosted) || auth.username || auth.password || auth.pathname !== '/' || auth.search || auth.hash) {
    throw Error('RUNTIME_AUTH_ORIGIN_INVALID');
  }
  const port = env.PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw Error('RUNTIME_PORT_INVALID');
  const host = env.PREVIEW_HOST ?? '0.0.0.0';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw Error('RUNTIME_HOST_INVALID');
  const childEnv = {};
  for (const key of passthrough) if (env[key] !== undefined) childEnv[key] = env[key];
  Object.assign(childEnv, { DATABASE_URL: value, BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: auth.origin, PORT: port, PREVIEW_HOST: host,
    MANDATEGATE_DISABLE_PAYMENTS: mode === 'neon-sandbox' ? env.MANDATEGATE_DISABLE_PAYMENTS : '1',
    MANDATEGATE_RUNTIME_MODE: mode, NEXT_TELEMETRY_DISABLED: '1' });
  if (mode === 'neon-sandbox') {
    // A reviewer may replay the forever-nonpayable synthetic demo even while
    // a separate trusted request uses PayPal Sandbox. No reviewer is ADMIN.
    childEnv.MANDATEGATE_JUDGE_PREVIEW_ENABLED = '1';
    if (env.MANDATEGATE_DISABLE_PAYMENTS === '0') {
      if (env.MANDATEGATE_SANDBOX_PAYOUTS !== '1' ||
          env.PAYPAL_BASE_URL !== 'https://api-m.sandbox.paypal.com')
        throw Error('RUNTIME_SANDBOX_PAYOUT_GRANT_REQUIRED');
      for (const key of ['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET']) {
        const value = env[key];
        if (typeof value !== 'string' || value.length < 8 ||
            value.length > 4096 || /\s/.test(value))
          throw Error('RUNTIME_SANDBOX_CREDENTIALS_REQUIRED');
        childEnv[key] = value;
      }
      childEnv.PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com';
      if (typeof env.PAYPAL_WEBHOOK_ID === 'string' &&
          /^[A-Za-z0-9-]{8,128}$/.test(env.PAYPAL_WEBHOOK_ID))
        childEnv.PAYPAL_WEBHOOK_ID = env.PAYPAL_WEBHOOK_ID;
      const receiver = env.DEMO_PAYPAL_RECEIVER_EMAIL?.trim();
      if (!receiver || receiver.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiver) ||
          receiver === 'ap@northstar.example')
        throw Error('RUNTIME_SANDBOX_RECEIVER_REQUIRED');
      childEnv.DEMO_PAYPAL_RECEIVER_EMAIL = receiver;
    }
  }
  // Only independently reviewed, exact original SHA values cross the isolated
  // process boundary; without this forwarding the judge page silently hides
  // all saved consented fictional GLM observations.
  const judgeSources = neonMode ? validatedJudgeSourceAllowlist(env) : undefined;
  if (judgeSources) childEnv.JUDGE_SYNTHETIC_SOURCE_SHAS = judgeSources;
  const invoiceAi = invoiceAiEnvironment(env, mode);
  if (neonMode) {
    // Boolean-only diagnostics; never log or return the API key or any URL.
    if (env.RENDER_SERVICE_ID === 'srv-db39vmm7bikc73c55nh0') {
      const receiver = env.DEMO_PAYPAL_RECEIVER_EMAIL?.trim() ?? '';
      console.info('SANDBOX_READINESS', JSON.stringify({
        mode,
        paymentsDisabled: env.MANDATEGATE_DISABLE_PAYMENTS === '1',
        explicitPayoutGrant: env.MANDATEGATE_SANDBOX_PAYOUTS === '1',
        sandboxApiSelected: env.PAYPAL_BASE_URL === 'https://api-m.sandbox.paypal.com',
        clientIdConfigured: typeof env.PAYPAL_CLIENT_ID === 'string' &&
          env.PAYPAL_CLIENT_ID.length >= 8,
        clientSecretConfigured: typeof env.PAYPAL_CLIENT_SECRET === 'string' &&
          env.PAYPAL_CLIENT_SECRET.length >= 8,
        recipientConfigured: receiver.length <= 254 &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiver) &&
          receiver !== 'ap@northstar.example',
      }));
    }
    console.info('INVOICE_AI_CONFIG', JSON.stringify({
      optedIn: env.MANDATEGATE_ENABLE_INVOICE_AI === '1',
      renderServiceBound: env.RENDER_SERVICE_ID === 'srv-db39vmm7bikc73c55nh0',
      parentKeyPresent: typeof env.EXPLABS_API_KEY === 'string' && env.EXPLABS_API_KEY.length > 0,
      forwardedKeyPresent: typeof invoiceAi.EXPLABS_API_KEY === 'string' && invoiceAi.EXPLABS_API_KEY.length > 0,
      syntheticExceptionEnabled: invoiceAi.MANDATEGATE_SYNTHETIC_NON_ZDR_TEST === '1',
      sandboxPayoutCredentialsForwarded: Boolean(childEnv.PAYPAL_CLIENT_ID && childEnv.PAYPAL_CLIENT_SECRET),
      judgeSyntheticSourceCount: judgeSources ? judgeSources.split(',').length : 0,
    }));
  }
  Object.assign(childEnv, invoiceAi);
  // Invoice AI is separately opt-in. Only explicitly approved Sandbox keys
  // cross in neon-sandbox; agent keys, host overrides and alternate DB stay out.
  return { mode, isolated: true, childEnv };
}
