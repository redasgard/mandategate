# MandateGate continuation handoff (2026-10-24/25)

READ THIS FIRST after context compaction or a new implementation session. This is a durable handoff, not a claim that unfinished work has been completed. Confirm against current repository/CI state before acting.

## Product goal and constraints
MandateGate is a zero-trust payment control platform for autonomous operations agents. An agent submits a vendor invoice; MandateGate analyzes evidence and policy, produces ALLOW / ESCALATE / DENY, and only permits payment through independently verified authorization. Normal trusted payments may auto-execute under a standing mandate; escalations need explicit admin review; destination mismatch is blocked. Preserve PayPal Sandbox idempotency, evidence, auditability and the three-scenario judge demo. Prefer fastest safe path to a working hosted beta, with minimal user interaction and no unnecessary services.

## New architecture decision (supersedes conversational Assistant portions of approved PRD/spec)
- NO user-facing chat, arbitrary/custom questions, free-text prompt entry, or chat history surface.
- AI is exposed only through predefined UI operations with typed inputs/outputs, per-tenant authentication and authorization, fixed evidence scope, budget/time limits and independent result validation.
- Internal bounded agentic investigation is allowed: a fixed function may choose among allowlisted READ-ONLY tools/steps, with strict step and cost limits. No arbitrary tools or privilege expansion.
- Initial operations: Explain Decision and Investigate Risk (or Investigate Vendor if supported by existing data). A structured policy recommendation is optional, not a beta blocker.
- LLMs (initially existing GLM integration) handle extraction, explanations and bounded interpretation. Do not pass raw unrestricted history to providers; enforce privacy/retention requirements and fail closed where required.
- Deterministic engine owns permissions, policy, vendor destination trust, exact arithmetic, state, idempotency and payment execution. Risk models (Jev/Laya, tabular ML, Qwen challenger) are OPTIONAL advisory evidence only; integrate only if measured against simpler baseline and useful to acceptance tests. Models can increase scrutiny or escalate but cannot clear hard blocks or grant payment authority.
- Consequential actions require exact immutable proposals, independent policy validation and explicit admin confirmation; no model authorization. No real funds; PayPal Sandbox only.

## Implementation location and verified actions
Repository: redasgard/mandategate (private); connected GitHub integration works, including push.
Base branch at start: build/slice-3-invoice-intake, base commit 0ada1aa1b28a03f438978ffd3e89f90839f38c66.
Working branch: security/disable-freeform-assistant.
Draft PR #65: https://github.com/redasgard/mandategate/pull/65
Commits on PR:
- 5b124f458dee9162808c619ff8c334e00795a48a: app/api/assistant/route.ts changed to return 401 for unauthenticated and 410 FREEFORM_ASSISTANT_DISABLED for authenticated GET/POST. Old free-text LLM invocation and history storage removed from route.
- f9de56cd9ecb10d066ef773e23d1d11755c1728f: app/assistant/assistant-client.tsx removes chat UI, textarea and history fetch; shows static AI Operations notice.
- 690d711059ba9327c150fa8754cf67170ffbe627: app/assistant/page.tsx renamed visible Assistant heading to AI Operations.
CI for PR head 690d711...: run 40169494851, verify job 121097271930, conclusion FAILURE. Log fetch returned GitHub blob 404; root cause UNKNOWN. No tests verified green; not merged, not deployed. PR is draft. This is only a lockdown first step, not the completed agentic replacement.

## Next work in priority order
1. Diagnose CI failure through GitHub checks, job steps, or rerun if necessary. Fix with evidence. Do not claim green until observed.
2. Find all Assistant links/components/routes and ensure no residual custom-question or chat entry point. Add regression tests for GET/POST 401/410 and no provider invocation. Consider returning 410 for all requests only after auth as currently done.
3. Implement one bounded typed read-only operation end-to-end, preferably Explain Decision for an exact existing payment/decision ID. Validate tenant ownership, restrict evidence fields, limit model context, use a fixed server-side prompt, schema-check output, verify cited evidence references; fail closed on provider/privacy uncertainty. Add integration and adversarial tests. Then Investigate Risk if time.
4. Update devpost/prd.md, devpost/spec.md and devpost/checklist.md to record the newly approved function-only architecture, replacing contradictory conversational requirements; preserve unrelated approved scope. Add explicit decision-log entry and security acceptance criteria.
5. Finish/verify PayPal Sandbox ALLOW/ESCALATE/DENY end-to-end and invoice Gate H privacy/provenance blockers; don't misrepresent fictional demo lane as production-ready real invoice execution.
6. Verify hosted Render deployment and judge demo, then critical review. No merge/deploy claim without evidence.

## Known project facts and blockers
- Existing devpost/prd.md, devpost/spec.md and devpost/checklist.md are approved baseline artifacts; checklist stages 1 and 2 checked, 3-13 not verified complete.
- Current spec already mentions GLM-5.3 Flash, optional Qwen challenger, Jev typed judgments, Laya comparator. Avoid implementing all just for appearance.
- Stage 3 strict provider privacy gate (Experiential ZDR/no-training/capture) previously blocked; separate fictional-only consented demo lane is non-authorizing and always ESCALATE. Reverify current facts.
- Repo package.json: Next 16.3.8, React 19.3.0, TypeScript 6.0.3, pnpm 12.9.1, vitest 5.0.3; scripts: typecheck, test, build.
- Direct container internet/GitHub DNS previously failed, but connected GitHub MCP works. Hermes Agent not running, no persistent Hermes runtime established. Do not wait for user's PC or promise unattended background execution.
- User requests minimal human interaction, concise factual reports, autonomous progress, no speculative completion. User explicitly worried context compression loses design decisions. Read this handoff and actual repo state before continuing.

## Resume command for future agent
Read this file, devpost/prd.md, devpost/spec.md, devpost/checklist.md, PR #65 and latest CI. Continue from verified state, prioritize a functional beta and security acceptance tests, keep work on a reviewable branch, and record material decisions here and in project docs. Never replace existing facts with assumptions.
