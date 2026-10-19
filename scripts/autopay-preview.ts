// Read-only autonomy preview. No gateway imports, no provider credentials.
// Requires a local or explicitly approved non-financial development DB.
import { previewAutonomousDispatch } from "../src/autonomy/dispatch";
import { pool } from "../src/db/pool";

if (process.env.MANDATEGATE_DISABLE_PAYMENTS !== "1") {
  throw Error("AUTOPAY_PREVIEW_REQUIRES_PAYMENTS_DISABLED");
}
try {
  const result=await previewAutonomousDispatch();
  const ready=result.filter(r=>r.preview==="WOULD_DISPATCH").length;
  const held=result.length-ready;
  console.log(JSON.stringify({
    mode:"PREVIEW_ONLY",transactionsSubmitted:0,
    source:"AUTHORITY_REVALIDATED_CANONICAL_REQUESTS",
    candidates:result.length,ready,held,items:result,
  },null,2));
} finally {
  await pool.end();
}
