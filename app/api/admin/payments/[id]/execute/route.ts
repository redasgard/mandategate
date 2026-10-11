import { NextRequest } from "next/server";
import { auth } from "@/src/auth/auth";
import { pool } from "@/src/db/pool";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { executeAuthorizedPayment, ExecutionRejectedError } from "@/src/payments/executor/service";
import { postgresExecutionStore } from "@/src/payments/executor/postgres-store";
import { getPayPalClient } from "@/src/payments/paypal/runtime";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationOrigin(request)) return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    return Response.json({error:"NOT_FOUND"},{status:404});
  const isAuthorized = async () => {
    const membership = await pool.query([
      "select 1 from payment_requests pr",
      "join organization_admin_memberships m on m.organization_id=pr.organization_id",
      "where pr.id=$1 and m.user_id=$2 and m.role='ADMIN' and m.active=true",
      "limit 1",
    ].join(" "), [id,session.user.id]);
    return membership.rows.length===1;
  };
  // Logging in is not authorization to act on another organization's funds.
  if (!(await isAuthorized()))
    return Response.json({error:"NOT_FOUND"},{status:404});
  try {
    const execution = await executeAuthorizedPayment(id, {
      store:postgresExecutionStore,gateway:getPayPalClient(),
      // Membership can be revoked after the initial route preflight.
      // The executor rechecks after taking its durable payment claim and
      // immediately before any external PayPal submission.
      beforeSubmit:async()=>{
        if(!(await isAuthorized()))
          throw new ExecutionRejectedError("ADMIN_ORGANIZATION_MEMBERSHIP_REVOKED");
      },
    });
    return Response.json({ execution });
  } catch (error) {
    if (error instanceof ExecutionRejectedError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
