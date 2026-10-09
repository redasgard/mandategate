import { readdir, readFile } from "node:fs/promises";
import { loadLocalEnv } from "../src/env/load";

loadLocalEnv();
const [{ auth }, { pool }, { getMigrations }] = await Promise.all([
  import("../src/auth/auth"),
  import("../src/db/pool"),
  import("better-auth/db/migration"),
]);

const migrations = await getMigrations(auth.options);
await migrations.runMigrations();

const migrationDir = new URL("../drizzle/", import.meta.url);
const files = (await readdir(migrationDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
for (const file of files) {
  const sql = await readFile(new URL(file, migrationDir), "utf8");
  await pool.query(sql);
}
await pool.end();
console.log(`database migrated (${files.length} application migrations)`);
