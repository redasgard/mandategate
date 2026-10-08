# Slice 3A Gate G: Compositional Source-to-Sink Tests

## Critique gate
**Step:** Baseline, receiver-substitution and source-marker ablation at the authority proposal sink.
**Decision:** CONTINUE only to Gate H readiness assessment. Full live adversarial model-to-payout proof remains BLOCKED.
**Score:** 8.3/10 for isolated deterministic authority tests, not complete injection resistance.
**Review independence:** self-review with reproducible GitHub Actions/PostgreSQL evidence.

### Evidence checked
- `tests/payment-proposal.test.ts`: a clean synthetic verified-claim baseline produces exactly five VERIFIER->authority.payment_proposal source-to-sink records with digest equality against independently stored normalized claim values. It creates no payment request.
- Three substituted payout addresses independently yield DENY, `INVOICE_DESTINATION_SUBSTITUTION`, a POLICY decision trace and zero payment-request rows.
- Marker-ablation test changes real stored invoice artifact bytes by adding/removing a forged SYSTEM instruction, keeps the same malicious receiver, and demonstrates identical DENY independent of marker presence. Its actual source text is verified in PostgreSQL.
- Full CI on the adversarial test commit `7556989eb32e8b7bf085472577868a797103b22a`: GitHub Actions run `37830032708` SUCCESS, 12 SQL migrations twice, seed twice, 16 test files/124 tests, typecheck, build, smoke, zero payouts.
- Gate F reviewer UI on `3a77c82c5e88532c480cc2caa8780ac4f892db25` has green CI run `37830327662`; no payment side effect.
### Artifact scores
| Artifact | Score | Main weakness |
|---|---:|---|
| Source-to-sink parameter evidence | 8.6 | Proposed values have synthetic DB-verification provenance, not independently parsed real PDF bytes |
| Receiver attack matrix | 9.0 | Tests bypass model and simulate vetted field records |
| Marker-ablation control | 8.2 | Proves deterministic gate ignores forged text hints; not a full Urd trace across live GLM |
| No unauthorized payout guarantee | 8.8 | Proposal helper has no PayPal access and no payment rows; executable runtime path remains unproven |
### Findings
1. **HIGH - Actual untrusted-image/PDF-to-payment compositional attack not exercised.**
   - Evidence: fixtures are manually populated claim rows and origin attestations. There is no independently parsed page-evidence chain from actual PDFs, and no live Flash adversarial response included.
   - Impact: a realistic model-selected amount/vendor/currency attack across the full composed system is still UNVERIFIED; cannot advertise the entire prompt-injection boundary as experimentally proven.
   - Required repair: run real synthetic PDF/image parser plus GLM observation, independently corroborate each claimed field, and instrument the exact promotion into the authority service. Absent independent proof must remain ESCALATE.
   - Verification: source-to-sink event trace from actual artifact to proposal for legitimate and malicious inputs; reproduce with and without friendly provenance markers.
2. **MEDIUM - Test coverage is not a substitute for actual PayPal execution-bound validation.**
   - Evidence: these tests never invoke external Payouts API, by design.
   - Impact: they prove non-dispatch from the proposal helper, not the full execution boundary under real webhook/retries.
   - Required repair: Gate H Sandbox proof after source/identity/live key prerequisites are met.
### Requirement coverage
- VERIFIED: deterministic baseline/attack/marker-ablation on stored synthetic artifacts; exact trace digests; protected destination denial; no logical payment request for denied proposals; CI success.
- UNVERIFIED: actual GLM/PDF injection, independent source-to-claim parser proof, live final Payouts behavior, acceptance across full integration.
- INCORRECT: claiming complete Urd-equivalent end-to-end adversarial coverage from these tests would overstate evidence.
### Repair order
1. Bind independent parser/OCR source hashes to exact artifact and claim values.
2. Run true model/source-composition adversarial fixtures.
3. Repeat bound reviewer/PayPal execution tests on a distinct controlled Sandbox environment.
### Next gate
CONTINUE to Gate H **preflight only**. Do not ship or merge PR #2; invoice-to-payment release remains BLOCKED.
