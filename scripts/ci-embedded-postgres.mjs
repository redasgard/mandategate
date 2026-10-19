import EmbeddedPostgres from "embedded-postgres";
const dir = process.env.CI_PG_DATA_DIR;
if (!dir || !dir.startsWith("/tmp/mandategate-pg.")) throw new Error("CI_PG_DATA_DIR_INVALID");
if (typeof process.getuid === "function" && process.getuid() === 0) throw new Error("CI_POSTGRES_REFUSES_ROOT");
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password: "postgres",
  port: 55432,
  persistent: false,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: (line) => console.error("CI_PG_DIAGNOSTIC", String(line).slice(0,500)),
});
await pg.initialise();
await pg.start();
await pg.createDatabase("mandategate");
console.log("CI_PG_READY");
let stopped = false;
async function stop() {
  if(stopped)return;
  stopped = true;
  try { await pg.stop(); } catch(e) { console.error("CI_PG_SHUTDOWN_FAILED", String(e).slice(0,160)); }
  process.exit(0);
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
setInterval(() => {}, 10000);
