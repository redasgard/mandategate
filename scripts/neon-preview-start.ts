import { spawn } from "node:child_process";

if (process.env.MANDATEGATE_DISABLE_PAYMENTS !== "1") {
  throw new Error("Preview refuses to start without payment kill switch");
}
if (!process.env.DATABASE_URL || !/\.neon\.tech(?::|\/|\?|$)/.test(process.env.DATABASE_URL)) {
  throw new Error("Preview requires an explicit Neon database URL");
}
for (const name of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"]) {
  if (process.env[name]) throw new Error(`Preview forbids ${name}`);
}
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error("Missing Better Auth secret");
}

const child = spawn("pnpm", ["exec", "next", "start"], { stdio: "inherit", env: process.env });
child.on("error", err => { console.error(err); process.exit(1); });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
