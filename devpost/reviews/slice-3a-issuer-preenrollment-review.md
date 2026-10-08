# Gate D2: Trustworthy Origin-Channel Pre-Enrollment

## Critique gate
**Step:** Prevent after-the-fact enrollment of an issuer channel from giving an invoice apparent origin authenticity; expose a session-bound human attestation surface.
**Decision:** CONTINUE to authenticated reviewer UI and staging-readiness code only. Gate H and all invoice-derived payouts remain BLOCKED.
**Score:** 8.6/10 (isolated implementation).
**Review independence:** self-review, with CI/PostgreSQL negative controls.

### Evidence checked
- Commit `ef4c69e6db457f07cdef9d691005772689b90484`.
- GitHub Actions `37855010516`: SUCCESS, 20 test files / 147 tests, migrations twice, seed twice, typecheck, Next build and smoke.
- `origin-attestation.ts`: active admin role, tenant + vendor channel, channel enrollment date strictly before artifact creation, immutable attestation reference and method.
- `payment-proposal.ts`: rechecks enrollment timestamp even if caller inserted forged attestation records directly.
- `binding-guard.ts`: rejects postdated channel at frozen-tuple authorization and executor revalidation.
- `app/api/admin/invoice-artifacts/[id]/origin-attestations/route.ts`: Same-Origin and Better Auth checks, strict JSON, bounded request, server-derived tenant, SHA precondition, no payout.
- Positive/negative tests `tests/origin-attestation.test.ts`, `tests/payment-proposal.test.ts`, `tests/origin-attestation-route.test.ts`.

### Artifact scores
| Artifact | Score | Main weakness |
|---|---:|---|
| Channel pre-enrollment chronology | 9.0 | Syntactic pre-enrollment does not verify supplier identity |
| Layered proposal/executor guards | 9.0 | Integration only in CI |
| Session-bound attestation API | 8.4 | No verified live Better Auth session in Render |
| Actual external issuer validation | 3.0 | No independent callback or trusted ERP/portal receipt witnessed |

### Findings
1. **MEDIUM: The independent reference remains human-attested, not cryptographically verified.** The service checks reference format, channel and reviewer role; it cannot independently prove the callback happened. Verify by comparing the ref with an actual out-of-band communication/ERP receipt; never call a synthetic fixture a real issuer.
2. **MEDIUM: No Render staging origin/reviewer login evidence.** Test identity is seeded; hosted session and cookie protections need live testing.
3. **MEDIUM: Channel registry enrollment evidence is an immutable hash, not a verified external contact.** The operator must establish the enrollment against a known independent source before the invoice exists.

### Requirement coverage
- VERIFIED: pre-enrollment chronology at attestation and sink; forged late channel rejection; signed-in admin enforcement in services and unauthenticated HTTP negatives; no payment calls; CI green.
- UNVERIFIED: real issuer identity, completed human callback/portal/ERP check, hosted authenticated reviewer, live GLM privacy, Sandbox three-case payout.
- INCORRECT: calling the source reference itself a verified supplier confirmation.

### Repair order
1. Wire reviewer UI, including original artifact, parser-bound T2 claims, eligible pre-enrolled T3 channel, evidence reference and exact tuple approval.
2. In an explicitly confirmed Render workspace, deploy a distinct isolated staging service and verify actual session/tenant/operator behavior.
3. Record independent issuer source proof and independently verify its reference; then stage GLM privacy/adversarial and PayPal Sandbox cases.

### Next gate
CONTINUE only to isolated reviewer UI. Keep draft PR #2 unmerged and Gate H BLOCKED.
