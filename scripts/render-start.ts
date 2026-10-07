import { spawn } from "node:child_process";

if (process.env.RUN_SLICE2_SANDBOX_PROOF === "1") {
  console.log("running one-time Slice 2 PayPal Sandbox proof before web startup");
  await import("./verify-slice2-sandbox");
}

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
