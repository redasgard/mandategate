# Gate E checkpoint: Verified invoice proposal without payment

## Critique gate

**Step:** Server-only exact-source proposal with fail-closed registry and policy reconciliation.
**Decision:** CONTINUE to finish Gate E's actual payment-request/executor binding; NOT to Gate F approval or live PayPal.
**Score:** 8.6/10
**Review independence:** self-review plus CI.

### Evidence checked

- src/authority/payment-proposal.ts: derives five payment-critical values only from T2 claim field records, independently admin-verified claim, current human origin attestation and active pre-enrolled vendor channel; resolves vendor, trusted destination and policy directly from DB; hard DENY for printed destination mismatch.
- Candidates never write a payment request or call PayPal. Eligible proposal remains ESCALATE with PENDING_EXACT_HUMAN_APPROVAL.
- Exact proposal tuple digest, immutable source/version and append-only selected-parameter trace.
- Migration drizzle/0009_proposal_identity.sql and tests/payment-proposal.test.ts: wrong organization, unverified claim, T1 fields, expired origin, substituted receiver, tuple immutability, repeated proposal.
- GitHub Actions CI 37823676374, commit c7d275911b90ad2907eab1bdfde0deebc270ac3f: success, 10 migrations twice, 16 test files / 115 tests, typecheck, seed twice, production build and smoke.

### Artifact scores

| Artifact | Score | Weakness |
| --- | ---: | --- |
| Server-side source/registry reconciliation | 8.9 | Trust depends on future admin claim creation/verifier integrity |
| Payment receiver isolation | 9.3 | Printed substitution always hard denied |
| Immutable proposal/digest | 9.0 | Hash is identity, not authorization |
| Payment integration | 5.0 | Verified-origin source not yet bound to request/executor |
| Negative tests | 9.0 | Synthetic DB records, not live issuer proof |

### Findings

1. **MEDIUM: There is no transactional consumption into a verified_invoice payment request or execution revalidation yet.**
   - Impact: no end-to-end approved invoice payment, as designed for this intermediate checkpoint.
   - Required repair: add exact binding identity to payment_requests and validate the current approval, claim, origin, vendor destination and policy before the PayPal executor creates a payout.
   - Verification: integration tests for stale or copied binding, invoice duplicates, destination changes and direct-model bypass.

2. **MEDIUM: An inserted VERIFIED row is not itself independent source proof.**
   - Impact: the trusted verifier must be authenticated and must inspect independently verified source bytes. Gate C currently lacks a real uploaded-PDF-to-page-text bridge.
   - Required repair: make the authorization-review flow capture per-field reviewer/source proof; no AI-only path can write VERIFIED.
   - Verification: malicious/model-only record remains unverified and never gets a payable binding.

### Requirement coverage

- VERIFIED: no model-driven PayPal execution; only server-derived receiver and immutable proposal; 115 passing tests; exact-once proposals; deliberate false-positive blocking.
- UNVERIFIED: real document parsing, issuer integrity, human approval, execution binding, live Sandbox.
- INCORRECT: treating proposal readiness as payment authorization would be unsupported.

### Repair order

1. Finish the guarded request-to-executor bridge with atomic binding consumption and final revalidation.
2. Add authenticated exact-parameter approval and independent verifier.
3. Run Urd-style adversarial source-to-sink tests and external Sandbox proof before release.

### Next gate

CONTINUE building Gate E2 on draft PR #2 only. Previous invoice-to-payment BLOCK still applies.
