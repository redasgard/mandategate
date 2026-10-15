# Synthetic three-case demo: bounded implementation review
Date: 2026-10-15 UTC
Step: Build a judge-visible, strictly nonpayable synthetic ALLOW / ESCALATE / DENY demonstration on the existing Render → Neon preview.
Decision: **CONTINUE** for development-branch integration and hosted acceptance testing. **NOT** a completed hackathon release gate.
Score (standard): **8.8/10**
Visual score: **UNVERIFIED**. No screenshot/browser inspection yet; visual release verdict withheld.
Review independence: **self-review**; supplemented with GitHub Actions CI.

## Evidence checked
- Feature PR #6, `build/slice-4-hosted-demo-journey`, last implementation SHA `eb370c0548854501df98b5450192df0be6ed403d`; merged as `113ed365797f112836a250eccaddd9b1ac88e00d` into Render source branch.
- Source CI: https://github.com/redasgard/mandategate/actions/runs/38755966323 and https://github.com/redasgard/mandategate/actions/runs/38755974851, both SUCCESS on `eb370c0`. Migration/seed idempotence, typecheck, test suite, production build, HTTP smoke all green.
- Read-only Neon query verified exact trusted synthetic destination `ap@northstar.example`, seeded demo admin/membership, no historical AP imports, no payment executions.
- Pending independent hosted checks: real Render deployed SHA, admin login, three created records, idempotent replay, reviewer/read-only evidence pages, zero payouts afterward. `scripts/verify-hosted-demo.mjs` contains the bounded acceptance procedure.

## Artifact scores
| Artifact | Score | Main weakness |
| --- | ---: | --- |
| `src/demo/scenarios.ts` and store | 8.9 | Synthetic fixture invariants tied to this exact Neon demo |
| `app/demo` and admin demo API | 8.7 | Visual QA and hosted integration pending |
| `src/payments/executor/service.ts` permanent hard fence | 9.3 | Explicit reserved invoice IDs (intentional) |
| Preview review/execute gates | 9.0 | Does not replace full financial authorization audit |
| Hosted probe | 8.0 | Authenticated execution not yet run |

Weighted dimensions: correctness 8.8, alignment 9.0, evidence 8.8, safety 9.2, completeness 8.2, simplicity 8.0 → 8.8 rounded.

## Findings and repair order
1. **HIGH, RESOLVED: future payment re-enablement could make a synthetic ALLOW request payable.** `executeAuthorizedPayment` now rejects the three reserved `DEMO-...-2026` invoice numbers before creating any execution. Test verifies each is rejected before store/gateway invocation, plus an unrelated request remains eligible.
2. **MEDIUM, MITIGATED: scenario fixtures could be created under changed policy/vendor state.** The loader requires the original admin membership, synthetic trusted destination, unchanged vendor/policy limits, and no historical imports or existing payouts for first creation. Replays use stable idempotency keys and can still work after a later import/payout if all three records already exist.
3. **MEDIUM, OPEN: hosted browser/identity proof is distinct from CI.** Next gate requires admin sign-in and static HTML/state verification on the actual Render service.
4. **MEDIUM, OPEN: fixture creation is three separately committed requests.** If the process stops midway, idempotent retry completes the remaining cases. The operation cannot submit money; this partial-data risk is acceptable for a synthetic lab, not a production payment transaction.
5. **LOW, OPEN: UI visual fidelity unverified.** Validate responsive rendering before declaring judge-ready.

## Requirement coverage
- VERIFIED: strict Neon preview/payments-off mode check, admin + origin boundary, exact synthetic vendor/policy prerequisites, permanent money-movement rejection, three policy outcomes, idempotent request keys, CI build/regression.
- SUPPORTED: HTML links and the admin demo page are present in source and production build passed.
- UNVERIFIED: post-merge Render deployment, hosted login, real Neon scenario creation, record counts, responsive visual inspection, live GLM inference, signed issuer proof, historical Sandbox payout, all P1/P2.
- INCORRECT: describing this stage as the complete P0 invoice→AI→PayPal journey.

## Next gate
1. Confirm merge SHA is live on Render, never merely built.
2. Run exact-source hosted acceptance probe with existing seeded demo admin credential from GitHub Actions secret, without any PayPal or AI provider credentials.
3. Verify three unique synthetic payment requests, required policy reasons, no payment executions or payouts, idempotent replay and unauthenticated/cross-origin rejection.
4. Capture hosted rendering and visual QA separately. Do not activate PayPal, modify the old Render DB, or label the synthetic path issuer-authenticated.
