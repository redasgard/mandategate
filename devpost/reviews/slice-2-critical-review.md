# Slice 2 Critical Review

## Critique gate

**Step:** Slice 2 - final re-review after credential, webhook, state-machine, and duplicate-recovery repairs
**Decision:** CONTINUE
**Score:** 9.4/10
**Review independence:** self-review, supplemented by deterministic CI and external Render/PayPal Sandbox runtime evidence

### Evidence checked

- Repaired application commit `11a577594d7f1949b83bae282995e252312bb68b`.
- Current branch state commit `765150022a540c819809a8b6dcaa5484a85617c2`; comparison to the deployed application commit shows only `devpost/build-state.md` changed.
- GitHub Actions run `37705824345` on repaired application code: migrations/seed idempotence, typecheck, 5 Vitest files / 30 tests, production build, and smoke all passed.
- GitHub Actions run `37706869716` on current branch head: every verification step passed.
- Credential-rotation Render proof: previous demo-admin credential rejected, new admin credential accepted, previous agent key rejected, new agent key accepted. Temporary previous-secret variables and rotation flag were then cleared.
- `drizzle/0002_paypal_webhook_receipts.sql`, `src/payments/paypal/webhook-receipts.ts`, `src/payments/paypal/webhook-processor.ts`, and the repaired webhook route.
- Database-backed webhook tests: duplicate receipt/audit collapse and interrupted-processing lease recovery.
- Monotonic payment-state tests: stale PENDING cannot regress PAID; valid REVERSED can follow PAID.
- Strict duplicate-batch client test: unrelated errors carrying payout-shaped links are rejected; `BATCH_ALREADY_EXISTS` recovery remains supported.
- Exact-code Render deployment `dep-db3dsurtqb8s73djfehg`: third migration applied, webhook recovery runner executed, and the service became live.
- Live-safe idempotency proof deployment `dep-db3duutg1s2s73a29s8g`: existing logical payment `ff515077-bf90-4800-80d7-3ef8f33d6ee2`, batch `BA7V96FCY8Z64`, and item `A3R9LWD8XTX72` were reused; final status remained PayPal `SUCCESS` / local `PAID`; executionRows=1; submittedEvents=1; webhookVerifiedEvents=1; reconciledEvents=2; webhookReconcileFailures=0.
- Clean Render deployment `dep-db3e033tqb8s73djqfqg` of the same repaired application commit after proof flags were reset to disabled: migrations/seed/recovery ran and the service became live without invoking the proof runner.

### Artifact scores

| Artifact | Score | Main weakness |
|---|---:|---|
| Credential hygiene / rotation | 9.3 | Invalidated historical credential strings remain in old Render logs |
| Payment execution / idempotency | 9.7 | No material defect found in inspected evidence |
| Durable webhook receipt / recovery | 9.1 | New receipt layer is integration-tested and deployed, but no new real PayPal delivery has yet traversed it |
| Webhook deduplication | 9.4 | Event-ID and audit-ID idempotency are database-tested |
| Remote-state transition guard | 9.5 | No material defect found in inspected transition cases |
| PayPal duplicate-batch recovery | 9.6 | Recovery is now bound to the expected duplicate error |
| CI / exact deployment | 9.7 | Current branch CI is green; deployed application code differs only by later documentation |

### Findings

1. **LOW - Invalidated credentials remain visible in historical Render logs**
   - Evidence: old Render log history contains the credential material that triggered the previous BLOCK; live rotation proof established that both old credentials are now rejected.
   - Impact: the values no longer authorize access, but the historical logs remain sensitive operational material.
   - Required repair: no Slice 2 code repair. Keep log access restricted and do not copy historical credential values into documentation, issues, or submission artifacts.
   - Verification: rotation proof remains the authority for invalidation; future logs must not emit credential material.

2. **LOW - The repaired receipt layer has not yet received a new real signed PayPal webhook**
   - Evidence: real PayPal signature verification and webhook-triggered reconciliation were proven before the durability repair; after the repair, the receipt/dedupe/recovery path is covered by database-backed tests and exact-code Render deployment, while the live-safe proof reused the already-completed payout and therefore did not generate a new payout webhook.
   - Impact: there is a bounded composition-evidence gap, not an identified functional defect. Signature verification code is unchanged; the new logic begins only after successful verification.
   - Required repair: none for Slice 2 continuation. The next naturally occurring Sandbox payout webhook should be inspected to add post-repair live evidence without creating money movement solely for ceremony.
   - Verification: when such an event occurs, confirm one receipt row, one logical verified event, and PROCESSED state.

3. **LOW - Recovery is restart/duplicate-delivery driven in addition to immediate async processing**
   - Evidence: normal delivery schedules immediate asynchronous processing; persistent RECEIVED/RETRY/stale-PROCESSING receipts are also scanned during startup.
   - Impact: a verified receipt stranded without a process restart or duplicate delivery may wait longer than ideal. It remains durable and recoverable rather than lost.
   - Required repair: not a Slice 2 blocker. A periodic worker/Render workflow can tighten recovery latency when the broader hosted background-execution slice is implemented.
   - Verification: existing lease-recovery test and startup recovery evidence remain required until periodic recovery exists.

### Requirement coverage

- **VERIFIED:** previous exposed admin credential invalidated; previous exposed agent key invalidated; replacement credentials accepted; temporary rotation inputs removed from normal runtime; one real Sandbox payout; one logical execution; permanent local idempotency; deterministic PayPal identifiers; concurrent execution protection; lost-response retry safety; final PayPal `SUCCESS` / local `PAID`; real PayPal signature verification and webhook reconciliation; verified webhook persisted-before-ack design; webhook event-ID deduplication; reclaimable interrupted webhook processing; monotonic remote-state handling for tested stale/success-reversal cases; strict duplicate-batch recovery; current-branch CI; exact repaired-code Render deployment; clean runtime after proof flags were disabled.
- **SUPPORTED:** end-to-end real signed PayPal delivery through the newly added durable receipt table, because the real signed webhook evidence predates that post-verification persistence change while the new layer is independently integration-tested.
- **UNVERIFIED:** APIMatic usage, intentionally optional/deferred and not part of the Slice 2 completion contract.
- **INCORRECT:** the earlier BLOCK findings are no longer current; their required repairs are present and verified to the evidence level stated above.

### Repair order

1. No blocking repair remains for Slice 2.
2. Preserve the rotated credentials and keep proof/rotation flags disabled in normal runtime.
3. Capture a post-repair real webhook receipt when a naturally occurring Sandbox event provides one.
4. Move receipt recovery to the broader background-execution mechanism when that slice is implemented.

### Next gate

The five ordered repairs from the previous BLOCK have been completed. Current branch CI is green, the exact repaired application commit is live on Render, and the live-safe proof did not create a duplicate payout. **CONTINUE**: PR #1 is technically merge-ready for the Slice 2 milestone. APIMatic remains optional/deferred and must not be claimed as used without later evidence.
