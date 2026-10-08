# Gate E: Exact Authorized Request and Executor Boundary

## Critique gate

**Step:** Single-use verified-invoice source binding, transactional consumption, executor revalidation.
**Decision:** CONTINUE to Gate F human review/approval, on the isolated branch only. Invoice-to-payment RELEASE remains BLOCKED.
**Score:** 9.0/10 for execution-boundary code.
**Review independence:** self-review plus deterministic CI/PostgreSQL integration.

### Evidence checked

- src/authority/payment-proposal.ts and src/authority/binding-guard.ts: DB-only issuer/claim/vendor/destination/policy trust checks, frozen source and tuple SHA-256, human approval state, expiry, field identity and actor revalidation.
- src/authority/consume-invoice-binding.ts: accepts only an approved binding ID, atomically inserts exactly one verified_invoice payment_request/decision, marks binding CONSUMED and links request, returns replay ID for duplicates.
- src/payments/executor/postgres-store.ts: verified_invoice execution requires consumed binding linked to exact request, active admin verifiers/approver, current vendor destination and policy hash, artifact/source quote trust, exact amount/currency/invoice tuple. Existing agent_api requests remain separate.
- drizzle/0010_bound_invoice_request.sql: source/binding CHECK, composite org FK, single-binding and partial natural invoice uniqueness, immutability and valid state transitions.
- tests/payment-proposal.test.ts: one proposal, approved consumption and replay, denied forged unbound requests, recipient deactivation and policy drift block revalidation.
- GitHub Actions 37824558943 on commit 44ad41f799b84d3bdf1dd33e08a3ec9ef4c70618: success. 11 migrations twice, seed twice, 16 test files / 119 tests, typecheck, Next build and HTTP smoke; no PayPal POST.

### Artifact scores

| Artifact | Score | Main weakness |
| --- | ---: | --- |
| Exact binding/consumption transaction | 9.5 | Approval origin still manually simulated in CI |
| Current-state executor guard | 9.3 | External PayPal call cannot be atomically locked with DB |
| Source/tenant FK invariants | 9.4 | Database admin bypass not in scope |
| Human source and review assurance | 6.8 | No protected reviewer/claim-writing UI yet |
| CI and regression | 9.4 | No hosted Sandbox invoice execution |

### Findings

1. MEDIUM: Human approval is currently inserted directly in CI.
   - Evidence: tests manually update binding to AUTHORIZED with a synthetic actor/proof. There is no Better Auth reviewer endpoint or manual independent field confirmation.
   - Impact: CI proves execution guard semantics but not real actor identity or evidence provenance.
   - Required repair: Gate F creates session-authenticated admin review, independent fact confirmation, attestation, exact bound approve and stale/revoked behavior.
   - Verification: admin/nonadmin, other tenant, forged approval and parameter mutation tests.

2. MEDIUM: External network side effect remains non-atomic with approval revocation.
   - Evidence: execution guard revalidates before dispatch; another admin can change trust while a remote PayPal submission is in flight.
   - Impact: cannot guarantee cancellation of an already-started PayPal call.
   - Required repair: maintain irrevocable dispatch ledger, document cutoff point, and show before/after-dispatch races; stable PayPal-request-id must prevent duplicate payout.
   - Verification: deterministic race harness with gateway spy, plus live-safe Sandbox replay if/when authorized.

3. MEDIUM: Verified source truth still depends on a not-yet-built protected verifier/parser.
   - Evidence: Gate C pure verifier has not been bound to actual PDF page hashes. Tests manually prepopulate source-VERIFIED claim rows.
   - Impact: do not represent Gate E as independently validated real invoice-to-payment.
   - Required repair: implement issuer and field review independently of model and bind file hash and inspector ID before release.
   - Verification: real synthetic file inspection and mismatch negatives.

### Requirement coverage

- VERIFIED: exact binding to DB-authorized payee and version, atomic single-use consumed request, guard rechecks before PayPal dispatch, manual policy/destination revocation blocks, 119 CI tests.
- UNVERIFIED: real independent issuer/source facts, session-authenticated human approval, full source-to-sink adversarial tests and hosted payout.
- INCORRECT: label Gate E itself a full AI invoice-to-PayPal product would overclaim.

### Repair order

1. Implement Gate F manual reviewer actions deriving actor solely from Better Auth session with organization membership.
2. Add the independent source verification path and strict data provenance before any actual human approval is issued from a live UI.
3. Run Gate G causal and race tests, then Gate H compliant Sandbox demo/release review.

### Next gate

CONTINUE to Gate F implementation. The draft PR and real Sandbox invoice-payment gate remain BLOCKED.
