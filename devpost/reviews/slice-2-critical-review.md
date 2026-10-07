# Slice 2 Critical Review

## Critique gate

**Step:** Slice 2 - exactly one real PayPal Sandbox payout
**Decision:** BLOCK
**Score:** 8.8/10
**Review independence:** self-review, supplemented by deterministic CI and external Render/PayPal Sandbox runtime evidence

### Evidence checked

- GitHub Actions CI run `37658798924`: migrations/seed idempotence, typecheck, 22 tests, production build, health, and ALLOW/ESCALATE/DENY smoke.
- Render deployment of `build/slice-2-gated` at commit `60026accad1aa139a5fe49a8b0853a46d586e748`.
- Real Sandbox logical payment `ff515077-bf90-4800-80d7-3ef8f33d6ee2`.
- PayPal Sandbox payout batch `BA7V96FCY8Z64` and payout item `A3R9LWD8XTX72`.
- First live proof: one execution row, one `PAYPAL_SUBMITTED` event, PayPal status `PENDING`.
- Repeated proof/reconciliation: same request, logical payment, batch, and item; one execution row; one `PAYPAL_SUBMITTED`; final local `PAID` and PayPal `SUCCESS`.
- Live PayPal POST to `/api/paypal/webhooks` returned HTTP 200.
- Persistent audit proof: `webhookVerifiedEvents=1`, `reconciledEvents=2`, `webhookReconcileFailures=0`.
- Clean Render redeploy after proof flags were reset: migrations/seed completed, proof runner did not execute, Next.js became ready and Render marked the service live.
- `devpost/checklist.md` Slice 2 acceptance criteria, including the explicit APIMatic Context Plugin evidence requirement.
- `devpost/spec.md > APIMatic`, which requires reproducible evidence that the Context Plugin was used.

### Artifact scores

| Artifact | Score | Main weakness |
|---|---:|---|
| PayPal execution/state machine | 9.4 | No material defect found in inspected evidence |
| Live Sandbox payout proof | 9.5 | Proof is strong and persistent, but performed through a temporary guarded startup mechanism |
| Webhook verification/reconciliation | 9.3 | Verified live path with persistent event evidence |
| Render deployment | 9.0 | Proof flags required temporary runtime configuration changes; they are disabled again |
| Sponsor/developer-context compliance | 5.0 | Required APIMatic usage evidence is absent |

### Findings

1. **HIGH - Mandatory APIMatic usage/evidence is missing**
   - Evidence: the approved checklist requires using the APIMatic Context Plugin and preserving evidence; the spec requires reproducible sponsor-submission evidence. No such evidence exists in the repo or connected tool history.
   - Impact: Slice 2 does not satisfy its approved acceptance contract and cannot be marked complete or merged as `wire paypal` without either satisfying this requirement or explicitly revising the approved scope/spec/checklist.
   - Required repair: use the APIMatic Context Plugin against the PayPal integration and retain reproducible evidence, or make an explicit product/sponsor-scope decision to remove APIMatic from the mandatory Slice 2 contract and update all affected artifacts consistently.
   - Verification: inspect the retained APIMatic evidence or the approved artifact diff removing the requirement, then re-run this gate.

2. **LOW - Temporary proof runner should remain disabled outside verification**
   - Evidence: `scripts/render-start.ts` can run the Sandbox proof only when `RUN_SLICE2_SANDBOX_PROOF=1`; current Render runtime was redeployed with proof flags set to `0`.
   - Impact: accidental re-enabling could run proof logic during service startup, although permanent idempotency prevents a second logical payout for the fixed proof key.
   - Required repair: keep both proof flags disabled in normal runtime and document their verification-only purpose.
   - Verification: clean startup logs contain no `running one-time Slice 2 PayPal Sandbox proof` message.

### Requirement coverage

- **VERIFIED:** one real PayPal Sandbox payout; one logical payment; permanent local execution uniqueness; one `PAYPAL_SUBMITTED`; deterministic remote identifiers; repeated execution/reconciliation reuses the same payout; final PayPal `SUCCESS` / local `PAID`; live signed webhook acceptance; webhook-triggered reconciliation without recorded failure; production PayPal host rejection; concurrency/lost-response/unknown-outcome safety tests; clean Render deployment after proof.
- **UNVERIFIED:** APIMatic Context Plugin usage and reproducible evidence.
- **INCORRECT:** none in the inspected payment/runtime evidence.

### Repair order

1. Resolve the APIMatic requirement by actual usage/evidence or an explicit approved scope change.
2. Re-run the Slice 2 critical review.
3. Only on `CONTINUE`, check Slice 2, commit `wire paypal`, and merge PR #1.

### Next gate

Slice 2 remains blocked from completion only by the explicit APIMatic acceptance requirement. The PayPal Sandbox money-movement and webhook paths themselves have passed the required live verification.
