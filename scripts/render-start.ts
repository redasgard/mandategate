import { spawn } from "node:child_process";
import { requireStagingDatabaseTarget, verifyStagingDatabaseIdentity } from "../src/staging/database-guard";

if (requireStagingDatabaseTarget(process.env)) {
  const { pool } = await import("../src/db/pool");
  try { await verifyStagingDatabaseIdentity(pool); }
  finally { await pool.end(); }
}

async function runPnpmScript(script: string, label: string) {
  console.log(label);
  const child = spawn("pnpm", [script], {
    stdio: "inherit",
    env: process.env,
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${script} terminated by ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${script} exited with code ${code ?? "unknown"}`));
        return;
      }
      resolve();
    });
  });
}

if (process.env.RUN_DEMO_CREDENTIAL_ROTATION === "1") {
  await runPnpmScript(
    "security:rotate-demo-credentials",
    "running guarded demo credential rotation before web startup",
  );
}

if (process.env.RUN_SLICE2_SANDBOX_PROOF === "1") {
  await runPnpmScript(
    "verify:slice2:sandbox",
    "running one-time Slice 2 PayPal Sandbox proof before web startup",
  );
}

await runPnpmScript(
  "recover:paypal-webhooks",
  "recovering pending verified PayPal webhook receipts before web startup",
);

const child = spawn("pnpm", ["exec", "next", "start"], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
