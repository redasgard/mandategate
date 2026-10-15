import { loadLocalEnv } from "../src/env/load";

loadLocalEnv();

const [{ auth }, { pool }, { getMigrations }] = await Promise.all([
  import("../src/auth/auth"),
  import("../src/db/pool"),
  import("better-auth/db/migration"),
]);

try {
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('user','session','account','verification')
     ORDER BY table_name`,
  );
  const found = new Set(rows.map((row: { table_name: string }) => row.table_name));
  const required = ["user", "session", "account", "verification"];
  const missing = required.filter((table) => !found.has(table));
  if (missing.length) {
    throw new Error(`Better Auth migration incomplete: missing ${missing.join(", ")}`);
  }
  console.log("Better Auth schema verified (4 tables).");
} finally {
  await pool.end();
}
