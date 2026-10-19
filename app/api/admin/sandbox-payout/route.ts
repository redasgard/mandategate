import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { prepareSandboxPayout, SandboxPayoutError } from "@/src/demo/sandbox-payout";

export const runtime = "nodejs";

/**
 * Prepares exactly one canonical $1.01 synthetic Sandbox request.
 * No body-selected payee, invoice number, amount or payment credentials.
 * Does NOT call PayPal. The signed-in admin must separately click Execute.
 */
export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session = await auth.api.getSession({headers:request.headers});
  if (!session) return Response.json({error:"UNAUTHORIZED"},{status:401});
  if (request.headers.get("content-length") &&
      request.headers.get("content-length") !== "0")
    return Response.json({error:"SANDBOX_REQUEST_BODY_NOT_ALLOWED"},{status:400});
  try {
    const result = await prepareSandboxPayout(session.user.id);
    return Response.json(result, {
      status: result.replayed ? 200 : 201,
      headers: {"Cache-Control":"private, no-store"},
    });
  } catch (error) {
    if (error instanceof SandboxPayoutError)
      return Response.json({error:error.code},{
        status:error.httpStatus,headers:{"Cache-Control":"private, no-store"},
      });
    throw error;
  }
}