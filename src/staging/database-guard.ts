/** Fail closed before connecting or mutating the isolated Render Gate H database. */
export const GATE_H_DATABASE_NAME = "mandategate_gate_h_staging_db";
export const GATE_H_DATABASE_HOST = "dpg-db4351rl550s73acup8g-a";
export const GATE_H_DATABASE_USER = "mandategate_gate_h_staging_db_user";

export function requireStagingDatabaseTarget(env: NodeJS.ProcessEnv): boolean {
  if (env.MANDATEGATE_STAGING !== "1") return false;
  if (!env.DATABASE_URL) throw new Error("STAGING_DATABASE_URL_REQUIRED");
  let url: URL;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error("STAGING_DATABASE_URL_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
    (url.hostname !== GATE_H_DATABASE_HOST &&
      !url.hostname.startsWith(GATE_H_DATABASE_HOST + ".")) ||
    decodeURIComponent(url.pathname) !== "/" + GATE_H_DATABASE_NAME ||
    decodeURIComponent(url.username) !== GATE_H_DATABASE_USER) {
    throw new Error("STAGING_DATABASE_TARGET_MISMATCH");
  }
  if (env.BETTER_AUTH_URL !== "https://mandategate-gate-h-staging.onrender.com")
    throw new Error("STAGING_AUTH_ORIGIN_MISMATCH");
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new Error("STAGING_AUTH_SECRET_REQUIRED");
  if (!env.DEMO_ADMIN_EMAIL || !env.DEMO_ADMIN_PASSWORD ||
      env.DEMO_ADMIN_PASSWORD.length < 12)
    throw new Error("STAGING_ADMIN_CREDENTIALS_REQUIRED");
  const invoiceKey = env.DEMO_AGENT_API_KEY;
  const paymentKey = env.DEMO_PAYMENT_AGENT_API_KEY;
  if (!invoiceKey || !paymentKey || invoiceKey === paymentKey ||
      invoiceKey.length < 32 || paymentKey.length < 32 ||
      /\s/.test(invoiceKey) || /\s/.test(paymentKey))
    throw new Error("STAGING_DISTINCT_AGENT_KEYS_REQUIRED");
  if (env.PAYPAL_BASE_URL !== "https://api-m.sandbox.paypal.com")
    throw new Error("STAGING_PAYPAL_HOST_MISMATCH");
  if (env.RUN_SLICE2_SANDBOX_PROOF === "1" || env.RUN_DEMO_CREDENTIAL_ROTATION === "1")
    throw new Error("STAGING_UNEXPECTED_STARTUP_OPERATION");
  return true;
}
export async function verifyStagingDatabaseIdentity(connection: {
  query:(sql:string)=>Promise<{rows:Array<{database_name:string}>}>,
}) {
  let result: {rows:Array<{database_name:string}>};
  try { result = await connection.query("select current_database() as database_name"); }
  catch { throw new Error("STAGING_DATABASE_CONNECTION_FAILED"); }
  if (result.rows.length !== 1 || result.rows[0].database_name !== GATE_H_DATABASE_NAME)
    throw new Error("STAGING_CONNECTED_DATABASE_MISMATCH");
  return GATE_H_DATABASE_NAME;
}
