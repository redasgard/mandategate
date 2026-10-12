# Slice 7 targeted SQL mutation and cross-org HTTP critical review

## Critique gate
**Step:** Validate test sensitivity to weakened dashboard SQL predicates and cross-tenant access through two independently signed-in HTTP sessions.
**Decision:** CONTINUE for bounded regression test development; NOT a release approval.
**Score:** 9.2/10 for the bounded test increment (self-reviewed; subject to independent review).
**Review independence:** self-review supported by deterministic GitHub Actions, not independent verification.

### Evidence checked
- Code SHA `3783a9f9951a982220cc8f9f9533ecea7bbb765c`.
- Push CI `38322251184` SUCCESS, PR CI `38322252691` SUCCESS.
- Push job: 44 test files and 237 passed, production build/typecheck, migration+seed idempotence and signed-in smoke including independent cross-org HTTP sessions and zero payouts.
- `tests/payment-admin-tenancy.test.ts`, `scripts/verify-dashboard-cross-org-http.ts`, `scripts/smoke.ts`, `src/db/dashboard-overview.ts`, `src/db/views.ts`.

### Artifact scores
| Artifact | Score | Limitation |
| --- | ---: | --- |
| Targeted SQL mutation regressions | 9.2 | Four selected runtime query mutants, not a whole-code mutation campaign |
| Cross-org signed-in HTTP test | 9.4 | Server-rendered synthetic CI only; browser/hosted deployment not tested |
| CI evidence | 9.5 | Green deterministic test harness, no independent reviewer |
| Safety and isolation | 9.2 | Synthetic fixtures and CI guard; assertion integrity and completeness still need independent audit |

### Findings
1. **RESOLVED MEDIUM: mutation sensitivity.** Four targeted executable SQL mutations altered dashboard projection results and were caught by assertions: organization_id linkage, actor user_id, ADMIN role and active membership. The actor test uses a nonmember; role/active tests explicitly lower permissions. Invalid/untested mutations do not count as killed.
2. **RESOLVED MEDIUM: cross-organization HTTP authorization.** Two authenticated sessions and independent synthetic organizations verify exact tenant row visibility and metric changes across privilege promotion, revocation, restoration, and REVIEWER downgrade; foreign detail route returns 404.
3. **MEDIUM residual: mutation scope is deliberately limited.** No full source-level mutation score, mutation of `src/db/views.ts` access guards, race testing, or adversarial browser checks. Four targeted kills are not 100% security proof.
4. **MEDIUM residual: server HTTP is not a browser assessment.** No hosted visual, accessibility, responsive, client hydration, or externally operated account verification.
5. **HIGH outside bounded scope: issuer/channel authority, provider privacy, and separately authorized PayPal Sandbox invoice payout remain unverified.** Gate H remains blocked.

### Requirement coverage
- **VERIFIED:** four scoped mutant deviations, HTTP role transitions and foreign 404 via two signed-in sessions, 237 passing tests, production build, two CI runs on exact SHA, no CI payouts.
- **UNVERIFIED:** independent audit, complete authorization mutation coverage, browser/hosted runtime, production payment and model-provider behavior.
- **INCORRECT:** any claim that a test score of 9.8 was independently awarded, full product was approved, or that synthetic HTTP proves a real PayPal invoice payment.

### Independent verification handoff
1. Review the same SHA and compare the four mutant SQL edits against their baseline queries; confirm each mutation is semantically meaningful and exercised, not a SQL parse error.
2. Verify the two-session HTTP test cannot pass due to cross-org markers absent from all responses, unrelated demo memberships, or hardcoded fixture expectations; inspect audit of 404 and role transitions.
3. Recommend additional mutants for direct decision/detail SQL, predicate combinations, cache/stale session behavior, and concurrency; determine which are relevant to the bounded release decision.
4. Independently reproduce CI on a fresh PostgreSQL instance and inspect attached run logs without trusting this self-review.
5. Preserve PR #2 draft status and Gate H block. Do not merge/deploy or execute payouts based on this review.

**Next gate:** independent adversarial verification, followed by separate hosted/browser and payment-authority gates.
