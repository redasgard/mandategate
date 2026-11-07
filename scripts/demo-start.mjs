#!/usr/bin/env node
/**
 * MandateGate one-command local demo (judge-facing).
 *
 * Boots an isolated embedded PostgreSQL 18, applies migrations, seeds the
 * synthetic demo data and starts the app. Nothing external is contacted and
 * outbound payments are disabled by construction:
 *   - payments hard-disabled (MANDATEGATE_DISABLE_PAYMENTS=1)
 *   - no PayPal or AI credentials are read, required or used
 *   - the database lives in a throwaway directory, discarded on exit
 *
 * Usage:  pnpm demo:start        (Ctrl+C stops the app and the database)
 * Env:    PORT (app, default 3000) · DEMO_PG_PORT (database, default 55432)
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PG_PORT = Number(process.env.DEMO_PG_PORT ?? 55432);
const APP_PORT = Number(process.env.PORT ?? 3000);

const fail = (code, hint = "") => {
  console.error(`\n${code}${hint ? "\n" + hint : ""}`);
  process.exit(1);
};

if (Number(process.versions.node.split(".")[0]) < 20)
  fail("DEMO_START_NODE_TOO_OLD", "Node.js 20.9 or newer is required (the README pins Node 24).");
if (typeof process.getuid === "function" && process.getuid() === 0)
  fail("DEMO_START_REFUSES_ROOT", "Run as a regular user, not root.");
if (process.env.NODE_ENV === "production")
  fail("DEMO_START_NOT_FOR_PRODUCTION", "This script is a local, non-paying demo launcher.");

// ---------------------------------------------------------------- .env.local
const envPath = join(ROOT, ".env.local");
const parseEnvText = (text) => Object.fromEntries(
  text.split("\n").filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
    .map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
const token = (bytes) => randomBytes(bytes).toString("base64url");

const existingText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const fileEnv = parseEnvText(existingText);
const generated = new Set();
const ensure = (key, value) => {
  if (!fileEnv[key]?.trim()) { fileEnv[key] = value; generated.add(key); }
};
ensure("BETTER_AUTH_SECRET", token(48));
ensure("DEMO_ADMIN_EMAIL", "admin@mandategate.local");
ensure("DEMO_ADMIN_PASSWORD", token(18));
ensure("DEMO_AGENT_API_KEY", "mg_demo_agent_key_" + token(24));
ensure("DEMO_PAYMENT_AGENT_API_KEY", "mg_demo_payment_key_" + token(24));

if (generated.size > 0) {
  let text = existingText;
  if (text && !text.endsWith("\n")) text += "\n";
  for (const key of generated) text += `${key}=${fileEnv[key]}\n`;
  writeFileSync(envPath, text, { mode: 0o600 });
  try { chmodSync(envPath, 0o600); } catch { /* best effort */ }
  console.log("Generated local-only demo identities in .env.local (not shared, not committed).");
}

const appEnv = {
  ...process.env,
  ...fileEnv,
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/mandategate`,
  BETTER_AUTH_URL: `http://localhost:${APP_PORT}`,
  PORT: String(APP_PORT),
  MANDATEGATE_RUNTIME_MODE: "legacy",
  MANDATEGATE_DISABLE_PAYMENTS: "1",
  PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
  NEXT_TELEMETRY_DISABLED: "1",
};
delete appEnv.NODE_ENV;

// ------------------------------------------------------------------- ports
const portFree = (port) => new Promise((resolvePromise) => {
  const server = net.createServer();
  server.once("error", () => resolvePromise(false));
  server.once("listening", () => server.close(() => resolvePromise(true)));
  server.listen(port, "127.0.0.1");
});
if (!(await portFree(PG_PORT)))
  fail(`DEMO_PG_PORT_BUSY: port ${PG_PORT} is already in use.`, "Set DEMO_PG_PORT to a free port and retry.");
if (!(await portFree(APP_PORT)))
  fail(`DEMO_APP_PORT_BUSY: port ${APP_PORT} is already in use.`, "Stop the other process, or set PORT and retry.");

// -------------------------------------------------------- embedded postgres
let EmbeddedPostgres;
try {
  EmbeddedPostgres = (await import("embedded-postgres")).default;
} catch {
  fail("DEMO_EMBEDDED_POSTGRES_MISSING",
    "Run `pnpm install` first — the embedded-postgres devDependency provides the local database.");
}
try {
  const platformPackage = `@embedded-postgres/${process.platform}-${process.arch}`;
  const packageDir = dirname(require.resolve(`${platformPackage}/package.json`));
  const libpq = join(packageDir, "native", "lib", "libpq.so.5");
  const hydrateScript = join(packageDir, "scripts", "hydrate-symlinks.js");
  if (process.platform === "linux" && !existsSync(libpq) && existsSync(hydrateScript)) {
    console.log("Preparing embedded PostgreSQL libraries (one-time)…");
    spawnSync(process.execPath, [hydrateScript], { cwd: packageDir, stdio: "inherit" });
  }
} catch { /* non-linux installs or unexpected layouts are handled by embedded-postgres itself */ }

const dataDir = mkdtempSync(join(tmpdir(), "mandategate-demo-pg-"));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: "postgres", password: "postgres", port: PG_PORT,
  persistent: false, postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {}, onError: (line) => console.error("DEMO_PG:", String(line).slice(0, 300)),
});

let cleaned = false;
let dev = null;
const cleanup = async (code = 0) => {
  if (cleaned) return;
  cleaned = true;
  try { dev?.kill("SIGINT"); } catch { /* already gone */ }
  try { await pg.stop(); } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
  process.exit(code);
};
process.once("SIGINT", () => void cleanup(0));
process.once("SIGTERM", () => void cleanup(0));

console.log("Starting embedded PostgreSQL 18 (isolated; discarded when you stop)…");
await pg.initialise();
await pg.start();
await pg.createDatabase("mandategate");

const runStep = (args, label) => new Promise((resolvePromise, rejectPromise) => {
  console.log(`\n$ pnpm ${args.join(" ")}`);
  const child = spawn("pnpm", args, { cwd: ROOT, env: appEnv, stdio: "inherit" });
  child.once("error", () => rejectPromise(
    new Error(`${label}: could not run pnpm — is pnpm installed and on PATH?`)));
  child.once("exit", (code) => code === 0
    ? resolvePromise()
    : rejectPromise(new Error(`${label} exited with code ${code}.`)));
});
try {
  await runStep(["db:migrate"], "MIGRATE");
  await runStep(["demo:seed"], "SEED");
} catch (error) {
  console.error(`\n${error.message}`);
  await cleanup(1);
}

console.log(`
════════════════════════════════════════════════════════════
 MandateGate local demo — outbound payments are DISABLED
────────────────────────────────────────────────────────────
 Open:      http://localhost:${APP_PORT}/sign-in
 Email:     ${fileEnv.DEMO_ADMIN_EMAIL}
 Password:  ${fileEnv.DEMO_ADMIN_PASSWORD}
 Payments:  disabled — no PayPal credentials are required or used
 Database:  embedded PostgreSQL on 127.0.0.1:${PG_PORT} (isolated)
 Stop:      Ctrl+C (the database is discarded afterwards)
════════════════════════════════════════════════════════════`);
console.log("Starting the application…\n");

dev = spawn("pnpm", ["dev"], { cwd: ROOT, env: appEnv, stdio: "inherit" });
dev.once("exit", (code) => void cleanup(code ?? 0));
