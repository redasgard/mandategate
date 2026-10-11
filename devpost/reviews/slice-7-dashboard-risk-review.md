# Slice 7: Risk-first dashboard read increment

## Critique gate

**Step:** Add a tenant-scoped, read-only operational risk and payout-status panel while the invoice-origin Gate H remains blocked.
**Decision:** CONTINUE for this bounded development increment only; full Slice 7 and all release gates remain unchecked.
**Score:** 8.2/10.
**Review independence:** self-review supported by GitHub Actions; no independent human or live signed-in browser assessment.

### Evidence checked
- Commit `83753a5453e6002acb072646a36d1dfc300e3b8e` on draft PR #2.
- GitHub Actions pull_request run `38181543395` and push run `38181540340` both completed SUCCESS on that exact SHA.
- The PR run migrated PostgreSQL 19 application migrations twice, seeded twice, passed typecheck, 44 test files / 232 tests, built Next.js, and passed signed-in synthetic source/review/AP/vendor/activity smoke with zero payouts.
- Files: `src/db/dashboard-overview.ts`, `app/dashboard/page.tsx`, `tests/dashboard-overview.test.ts`.
- Existing original Render `mandategate-web` remained on prior LIVE deploy `dep-db5ub9l9fdbs73e58mug`, code `2fbbdcd9ef8a284449c6035eae3dae41afe94f8a`. No deployment was triggered for this increment.

### Artifact scores
| Artifact | Score | Main weakness |
| --- | ---: | --- |
| Dashboard query | 8.0 | New SQL is mocked in focused tests, not isolated in a PostgreSQL tenant regression |
| Risk-first server UI | 8.4 | No new signed-in HTTP/browser smoke or visual review of this exact page |
| Dashboard unit tests | 8.1 | Contract-only SQL assertions; no simulated false membership in an actual DB |

### Findings
1. **MEDIUM: New aggregate SQL lacks direct database integration coverage.** The focused tests inspect tenant-guard SQL and adapter mapping with a mocked pool. Existing HTTP smoke tests other surfaces, not this new dashboard. Add a PostgreSQL-backed tenant/revocation regression and signed-in GET /dashboard assertion before calling Slice 7 complete.
2. **MEDIUM: Summary is deliberately not the full financial dashboard.** The available PayPal balance and upcoming/overdue obligations are explicitly marked unavailable/not tracked. A PAID row's sum is a historical gross payout amount, not an account balance or net cash flow. Do not infer ledger accuracy, AG Grid integration, or scheduling.
3. **HIGH (unchanged external gate): Invoice-origin financial authorization is not ready.** Experiential/Flash real privacy proof, issuer assurance, and authorized Sandbox invoice payout have not occurred. Gate H remains BLOCKED; PR #2 is draft and unmerged.

### Requirement coverage
- VERIFIED (CI): compilation; mocked tenant-scoped aggregate contract; read-only UI bundle; prior security regression suite; zero-payments synthetic smoke.
- OBSERVED (code): only statuses `ESCALATED` and `DENIED` count as unresolved/current decisions; `PAYMENT_UNKNOWN_MANUAL_RECONCILIATION` has separate visibility; completed `PAID` payouts are currency-separated and kept in decimal text until BigInt formatting; missing financial data is not invented.
- UNVERIFIED: actual PostgreSQL access/revocation on the new query, exact-code browser rendering, external PayPal reporting balance, issuer confirmation, GLM ZDR, invoice-based Sandbox payment.

### Repair order and next gate
1. Cover new dashboard SQL with a PostgreSQL tenant/revocation fixture and signed-in HTTP smoke.
2. Continue the other approved read-only UX improvements without changing payment authority; no AG tool may bypass it.
3. Preserve Slice 3 and Slice 7 unchecked and Gate H BLOCK until independent external evidence and separate authorization are present.

**Next gate:** development continuation allowed; Slice 7 completeness, PR merge, deployment of this code and invoice-derived payout are not authorized by this review.
