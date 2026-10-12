# Slice 7: dashboard tenant and membership regression rework

## Critique gate

**Step:** Repair the incomplete PostgreSQL tenant-isolation assertions and missing authenticated /dashboard smoke identified in the prior 7.8/10 REWORK.
**Decision:** CONTINUE for this bounded development test increment only. Full Slice 7 and integrated Gate H release: BLOCK.
**Score:** 8.6/10 (bounded scope).
**Review independence:** self-review plus deterministic GitHub Actions checks; no separate human reviewer or hosted browser assessment.

### Evidence checked
- Patch sequence on draft PR #2 ending with verified code SHA `de6eb0b00146a96f30b851c3594091c8bd43516f`; preceding intermediate commits failed CI and were corrected.
- Push CI `38280509493` and PR CI `38280512499`: both SUCCESS for the same SHA.
- Push CI job `114916376045`: PostgreSQL 19 migrations twice, demo seed twice, typecheck, 44 test files / 234 tests, production build, signed-in HTTP smoke, zero payout calls.
- `tests/payment-admin-tenancy.test.ts`, `src/db/dashboard-overview.ts`, `app/dashboard/page.tsx`, `scripts/smoke.ts`, `.github/workflows/ci.yml`.

### Artifact scores
| Artifact | Score | Main weakness |
| --- | ---: | --- |
| PostgreSQL aggregate and row isolation regressions | 8.8 | Test schema and lifecycle still use CI database; not a full system-level isolation proof |
| Authenticated dashboard HTTP smoke | 8.5 | Live browser/visual behavior and external Render environment untested |
| Dashboard SQL and rendered financial summary | 8.4 | Balance and due-date/scheduling domains are intentionally incomplete |
| Traceable CI and project state | 8.6 | Self-review; no independent reviewer |

### Findings
1. **RESOLVED MEDIUM: exact aggregates.** The test now asserts exactly one owned pending escalation, one denied record, one unknown payout and two currency-separated PAID aggregate entries; foreign and prior-month rows cannot inflate them. Also tests no membership, reviewer-only role, revocation and restoration.
2. **RESOLVED MEDIUM: deterministic six-row foreign decoy.** Seven more-recent foreign escalations fill an unscoped top-six list, so removal of the tenant predicate must fail the owned-row assertion. The fixture also checks that unscoped dominance itself is true.
3. **RESOLVED MEDIUM: authenticated HTTP checks.** Same signed-in CI browser-equivalent HTTP session shows a synthetic invoice before revocation and no longer exposes that exact invoice afterward; anonymous and malformed-cookie visits redirect. CI restricts membership mutation to local synthetic credentials and restores membership in `finally`.
4. **RESOLVED LOW: test isolation.** PostgreSQL fixtures use a dedicated synthetic account rather than sharing the seeded demo admin; role changes and revocation restore in `finally`, teardown deletes fixture records.
5. **MEDIUM (bounded): no deployed browser/visual proof.** This confirms server-rendered HTTP behavior in CI, not hosted browser hydration, responsiveness, true PayPal reporting, or full Slice 7 readiness.
6. **HIGH (unchanged external gate): invoice-origin payment execution remains blocked.** Genuine Experiential/GLM zero-retention evidence, invoice issuer/channel proof and separately authorized Sandbox payout still lack end-to-end verification.

### Requirement coverage
- **VERIFIED (CI):** 44 test files/234 tests; two green workflows on exact code SHA; deterministic tenant and membership DB fixture; authenticated local dashboard route for relevant known organization; build/typecheck/migrations/seed; no external payout in the smoke.
- **UNVERIFIED:** visual/browser interaction on Render, complete finance dashboard, external identity/issuer proof, real GLM ZDR serving, invoice-derived Sandbox transfer and webhooks.
- **INCORRECT (repaired before release):** prior claim that a revoked admin's *entire* multi-organization dashboard must be empty. Actual invariant is that revoking an organization's membership removes that organization's data; other memberships may remain valid.

### Repair order and next gate
1. Keep PR #2 draft and Gate H BLOCK. Do not merge, deploy, create services, change secrets, or move money on the basis of these tests.
2. Continue bounded dependency-independent read-only/dashboard UI work with an explicit later hosted visual/HTTP review.
3. Run separate issuer, GLM privacy and Sandbox payout proof only after respective external authorization and safety preflight.

**Gate decision:** CONTINUE for the dashboard regression repair, not authorization for release.
