import { loadLocalEnv } from "../src/env/load";

loadLocalEnv();

const [{ recoverPendingPayoutWebhooks }, { pool }] = await Promise.all([
  import("../src/payments/paypal/webhook-processor"),
  import("../src/db/pool"),
]);

const results = await recoverPendingPayoutWebhooks(100);
const summary = results.reduce(
  (acc, result) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  },
  {} as Record<string, number>,
);

console.log(JSON.stringify({
  paypalWebhookRecoveryChecked: results.length,
  outcomes: summary,
}, null, 2));

await pool.end();
