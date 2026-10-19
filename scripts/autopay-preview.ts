// Read-only autonomy preview. No gateway imports, no provider credentials.
// Requires a local or explicitly approved non-financial development DB.
import { previewAutonomousDispatch } from "../src/autonomy/dispatch";
import { pool } from "../src/db/pool";

// Strictly synthetic local CI only. Never enumerate a real customer
// payment queue through a verbose build script or public/static deployment.
const db = new URL(process.env.DATABASE_URL ?? "postgresql://invalid@invalid/invalid");
if (process.env.CI !== "true" ||
    process.env.MANDATEGATE_DISABLE_PAYMENTS !== "1" ||
    !["127.0.0.1","localhost"].includes(db.hostname) ||
    db.port !== "55432" || db.pathname !== "/mandategate") {
  throw Error("AUTOPAY_PREVIEW_REQUIRES_DISPOSABLE_NONPAYING_CI");
}
try {
  const result=await previewAutonomousDispatch();
  const ready=result.filter(r=>r.preview==="WOULD_DISPATCH").length;
  const held=result.length-ready;
  console.log(JSON.stringify({
    mode:"PREVIEW_ONLY",transactionsSubmitted:0,
    source:"AUTHORITY_REVALIDATED_CANONICAL_REQUESTS",
    candidates:result.length,ready,held,
    plans:result.map(({authorization,preview,reason})=>({authorization,preview,reason})),
  },null,2));
} finally {
  await pool.end();
}
