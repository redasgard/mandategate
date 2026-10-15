/** A reversible, payment-disabled runtime selection. Never edits process.env. */
export const NEON_HOST = 'ep-silent-poetry-arjowm4d.c-4.us-west-2.aws.neon.tech';
export const RENDER_HOST = 'dpg-db39d5rbc2fs73d1ke70-a';
const modes = new Set(['legacy', 'neon-preview', 'render-preview']);
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
  if (env.MANDATEGATE_DISABLE_PAYMENTS !== '1') throw Error('RUNTIME_PAYMENT_SWITCH_REQUIRED');
  const value = mode === 'neon-preview' ? env.NEON_PREVIEW_DATABASE_URL : env.DATABASE_URL;
  const url = parseDatabase(value);
  if (mode === 'neon-preview') {
    if (url.hostname !== NEON_HOST || url.pathname !== '/neondb') throw Error('RUNTIME_NEON_TARGET_MISMATCH');
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
    MANDATEGATE_DISABLE_PAYMENTS: '1', NEXT_TELEMETRY_DISABLED: '1' });
  // Deliberately omit all provider keys, demo/rotation flags, NODE_OPTIONS,
  // the alternate connection string, and the source connection during Neon mode.
  return { mode, isolated: true, childEnv };
}
