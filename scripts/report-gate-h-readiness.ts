import { loadLocalEnv } from "../src/env/load";

loadLocalEnv();
const organizationId = process.env.GATE_H_ORGANIZATION_ID ?? "org_demo";
const { readGateHInventory } = await import("../src/gate-h/readiness-inventory");
const { pool } = await import("../src/db/pool");

try {
  // Inventory, never an authorization preflight or an instruction to submit.
  console.log(JSON.stringify(await readGateHInventory(organizationId), null, 2));
} finally {
  await pool.end();
}
