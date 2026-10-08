# Gate F2: Authenticated reviewer journey, isolated implementation

## Critique gate
**Step:** Compose real PDF source inspection, T2 fact review, pre-enrolled T3 issuer attestation, pending proposal and separate exact-tuple approval into an admin web journey.
**Decision:** CONTINUE to staging preflight preparation only. Gate H release is BLOCKED.
**Score:** 8.3/10 for isolated UI/API implementation.
**Review independence:** self-review, supplemented by GitHub Actions validation of exact branch commits.

### Evidence checked
- GitHub Actions `37855588215` on `84e9574b3cd1d355e2b8aa33245d20723fdfb2f9`: 21 files / 149 tests pass, frozen pnpm lockfile, migrations and seed twice, TypeScript, Next build, smoke.
- Admin-only list `/invoice-artifacts`; owner-scoped original PDF and page text `/invoice-artifacts/[id]`; field submission and independent source-check via `/verify-pdf-facts`.
- `/origin-attestations` requires a pre-enrolled channel and human out-of-band reference. `/proposals` resolves financial selectors only on server and creates no payment request.
- `/invoice-bindings/[id]` requires a separate exact-tuple reviewer approval.
- No new PayPal execution route or SDK, no deployment, and no real issuer callback was used.

### Artifact scores
| Artifact | Score | Main weakness |
|---|---:|---|
| Reviewer page navigation/composition | 8.6 | Needs real staging browser review |
| T2/T3 service and exact tuple boundaries | 8.8 | No external supplier evidence yet |
| HTTP identity and same-origin guards | 8.2 | CI covers negative requests, not signed-in hosted session |
| PayPal source-to-sink integration | 6.0 | No live invoice-derived transaction |

### Findings
1. **MEDIUM:** Hosted Better Auth cookie/session behavior, reviewer mutation, stale hash rejection and cross-tenant routing have not been witnessed. Stage in isolated Render with an independent database and distinct keys and verify 401/403 and real login.
2. **MEDIUM:** T3 human attestation uses a manually supplied evidence reference. It cannot cryptographically prove a callback, and the synthetic fixtures are not equivalent to a real issuer. Obtain and independently validate the external source.
3. **MEDIUM:** PDF worker packaging and UI use on Render have not been tested; CI executes from repository source tree.

### Requirement coverage
- VERIFIED: source-to-claim review path, origin pre-enrollment, proposal frozen tuple, reviewer UI, positive/negative CI and zero new PayPal API calls.
- UNVERIFIED: deployed UI, real supplier callback, staging principal cutover, actual payment.
- INCORRECT: describing this as “live authenticated reviewer verified” today.

### Repair order
1. Confirm the correct Render workspace and create separate staging service and Postgres.
2. Verify hosted admin and unauthorized sessions, PDF parsing, origin review, and exact tuple with actual trace.
3. Only then enable the bounded GLM and PayPal Sandbox proof lanes.
