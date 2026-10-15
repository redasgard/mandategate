import { spawn } from "node:child_process";
import { createRequire } from "node:module";

if (process.env.MANDATEGATE_DISABLE_PAYMENTS !== "1") {
  throw new Error("PREVIEW_PAYMENT_SWITCH_REQUIRED");
}
let target: URL;
try { target = new URL(process.env.DATABASE_URL ?? ""); }
catch { throw new Error("PREVIEW_DATABASE_URL_INVALID"); }
if (!["postgres:", "postgresql:"].includes(target.protocol) ||
    !target.hostname.endsWith(".neon.tech") || !target.username || !target.password) {
  throw new Error("PREVIEW_NEON_DATABASE_REQUIRED");
}
for (const name of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"]) {
  if (process.env[name]) throw new Error("PREVIEW_PAYPAL_CREDENTIALS_FORBIDDEN");
}
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error("PREVIEW_AUTH_SECRET_REQUIRED");
}
const port = process.env.PORT ?? "3000";
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error("PREVIEW_PORT_INVALID");
}
const host = process.env.PREVIEW_HOST ?? "0.0.0.0";
if (!["127.0.0.1", "0.0.0.0"].includes(host)) throw new Error("PREVIEW_HOST_INVALID");

// Launch the server directly, not behind a package-manager process tree.
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"),
  "start", "--hostname", host, "--port", port], {
  stdio: "inherit", env: process.env,
});
let stopping = false;
let forced = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const stop = (signal: "SIGINT" | "SIGTERM") => {
  if (stopping) return;
  stopping = true;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill(signal);
  timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      forced = true;
      child.kill("SIGKILL");
    }
  }, 8000);
  timer.unref();
};
const onTerm = () => stop("SIGTERM");
const onInt = () => stop("SIGINT");
process.once("SIGTERM", onTerm);
process.once("SIGINT", onInt);
child.once("spawn", () => {
  if (process.connected) process.send?.({ type: "preview-child", pid: child.pid });
});
child.once("error", () => {
  console.error("PREVIEW_SERVER_SPAWN_FAILED");
  process.exitCode = 1;
});
child.once("close", (code, signal) => {
  if (timer) clearTimeout(timer);
  process.removeListener("SIGTERM", onTerm);
  process.removeListener("SIGINT", onInt);
  const cleanStop = stopping && !forced && (code === 0 || signal === "SIGTERM" || signal === "SIGINT");
  process.exitCode = cleanStop ? 0 : (code === 0 ? 0 : 1);
  if (forced) process.exitCode = 1;
  if (process.connected) process.disconnect();
});
