import { auth } from "@/src/auth/auth";
import { demoPreviewEnabled } from "@/src/demo/scenarios";
import {
  evaluateJudgeCase, JudgeDemoError, readJudgeExecutionCount,
} from "@/src/demo/judge-readonly";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store" };

/** Read-only server-side evaluation of a fixed fictional policy case. */
export async function GET(request: Request) {
  if (!demoPreviewEnabled(process.env))
    return Response.json({ error: "JUDGE_DEMO_DISABLED" },
      { status: 404, headers: privateHeaders });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "UNAUTHORIZED" },
      { status: 401, headers: privateHeaders });
  try {
    // Count all local demo-org payout records immediately before returning a
    // new decision. This route never reads or writes payment authority.
    const executions = await readJudgeExecutionCount(session.user.id);
    if (executions !== 0) throw new JudgeDemoError("JUDGE_REPLAY_HALTED", 409);
    const caseId = new URL(request.url).searchParams.get("case") ?? "";
    const outcome = evaluateJudgeCase(caseId);
    return Response.json(outcome, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof JudgeDemoError)
      return Response.json({ error: error.code },
        { status: error.httpStatus, headers: privateHeaders });
    throw error;
  }
}
