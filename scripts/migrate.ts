import { readFile } from "node:fs/promises";
import { loadLocalEnv } from "../src/env/load";

loadLocalEnv();

const [{ auth }, { pool }, { getMigrations }] = await Promise.all([
  import("../src/auth/auth"),
  import("../src/db/pool"),
  import("better-auth/db/migration"),
]);

const migrations = await getMigrations(auth.options);
await migrations.runMigrations();

const sql = await readFile(new URL("../drizzle/0000_slice1.sql", import.meta.url), "utf8");
await pool.query(sql);
await pool.end();

console.log("database migrated");
