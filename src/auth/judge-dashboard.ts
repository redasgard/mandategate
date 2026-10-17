import { pool } from "@/src/db/pool";
import { DEMO_ORG_ID } from "@/src/demo/scenarios";

/**
 * The judge identity must never be used as an ersatz administrator.
 * A user with any active ADMIN membership retains the ordinary dashboard;
 * a demo-only REVIEWER is routed to the restricted judge experience.
 */
export async function isRestrictedJudge(userId: string): Promise<boolean> {
  const result = await pool.query([
    "select",
    "exists (select 1 from organization_admin_memberships",
    "where user_id=$1 and organization_id=$2 and role='REVIEWER'",
    "and active=true) as demo_reviewer,",
    "exists (select 1 from organization_admin_memberships",
    "where user_id=$1 and role='ADMIN' and active=true) as any_admin",
  ].join(" "), [userId, DEMO_ORG_ID]);
  const row = result.rows.length === 1 ? result.rows[0] : null;
  if (!row || typeof row.demo_reviewer !== "boolean" ||
      typeof row.any_admin !== "boolean") {
    throw new Error("JUDGE_DASHBOARD_ROLE_READ_FAILED");
  }
  return row.demo_reviewer && !row.any_admin;
}
