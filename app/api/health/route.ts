import { pool } from "@/src/db/pool";

export async function GET() {
  try {
    await pool.query("select 1");
    return Response.json({ ok: true, database: "ready" });
  } catch {
    return Response.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
