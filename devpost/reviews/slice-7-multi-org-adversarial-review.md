# Slice 7: multi-organization adversarial regression review

## Critique gate
**Step:** Strengthen the post-rework dashboard authorization proof beyond single-organization membership.
**Decision:** CONTINUE for bounded synthetic CI test improvement. Integrated release remains BLOCKED.
**Score:** 9.1/10 for the bounded regression increment, not the full product, dashboard release, or the earlier complete review.
**Review independence:** self-review; exact-commit CI is deterministic corroboration, not a separate independent reviewer.

### Evidence checked
- Source and diff: `tests/payment-admin-tenancy.test.ts` at `6ff63b89dbe7b31036515e9cd100acfa16d8f1c0`.
- Push workflow `38294415283`, PR workflow `38294421290`: both completed SUCCESS for that exact SHA.
- Push CI job `114961949884`: 44 test files, 236 passing tests, production build, migration/seed idempotence, authenticated local smoke and zero payouts.
- Baseline CI at `5885a0b8477cc1db3faa54406b9c875ae081164f` had 234 tests.

### Artifact scores
| Artifact | Score | Most consequential limitation |
| --- | ---: | --- |
| Multi-organization tenant regression | 9.3 | Not independent of shared local CI database and synthetic fixtures |
| Role transition and revocation coverage | 9.2 | No separate authenticated HTTP session for the second organization |
| Injection-shaped identity checks | 9.1 | Bounded to parameterized database queries, not every application input |
| Evidence traceability | 9.1 | Same model produced code and critique, although CI ran separately |

### Findings
1. **RESOLVED MEDIUM: cross-organization transition blind spot.** A second organization first grants REVIEWER (no data), then ADMIN (both organizations' precise EUR/USD aggregates and bounded top-six queue), then revokes membership (only initial organization's data remains). This is PostgreSQL-backed rather than mocked.
2. **RESOLVED LOW: injection-shaped identity negative coverage.** Tests confirm that a malicious-looking actor identifier cannot turn a bound parameter into an authorization predicate.
3. **MEDIUM UNRESOLVED: authenticated HTTP is bounded.** Local smoke checks the existing demo organization's invoice disappears after revocation. It does not exercise the second-organization promotion/demotion over a separate session. This remains for a later bounded HTTP test.
4. **MEDIUM UNRESOLVED: no mutation-testing or independent verifier.** Existing fixtures are adversarial but do not programmatically demonstrate that every relevant predicate mutation causes a red run.
5. **HIGH OUTSIDE THIS BOUNDED GATE: external issuer, GLM privacy and invoice-derived Sandbox payout evidence remain unverified.** Do not merge PR #2, deploy, or claim MandateGate release readiness.

### Requirement coverage
- **VERIFIED:** six PostgreSQL tenancy tests (including two new cases), exact two-organization counts and EUR/USD totals, role transitions/revocation, injection-shaped actor read denial, 44 passing test files / 236 tests, green push and PR CI on code SHA.
- **UNVERIFIED:** mutation-resistance of each SQL guard, multiple-org session-level smoke, hosted browser appearance/accessibility, external PayPal and model behavior.
- **INCORRECT:** any claim of a 9.8/10 independent review, production readiness or complete Slice 7 authorization.

### Repair order and next gate
1. Add controlled SQL predicate mutation checks and prove CI detects scope removal or role/status weakening.
2. Add bounded authenticated HTTP multi-organization fixture and exact response verification without reliance on unrelated seeded organizations.
3. Arrange independently executed adversarial evaluation and hosted/browser review with explicit separate deployment authorization.
4. Keep Gate H BLOCK until independently verified issuer, external model privacy and PayPal Sandbox evidence.

**Gate:** CONTINUE for dependency-independent regression hardening only, not release.
