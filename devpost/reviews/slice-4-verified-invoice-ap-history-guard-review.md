# Slice 4 cross-path imported AP-risk authority repair - critical review

**Date:** 2026-10-11 UTC
**Review independence:** self-review, supplemented by reproducible GitHub CI / PostgreSQL integration tests. NOT an independent penetration test.
**Step:** Repair imported paid-invoice risk parity for verified PDF invoice proposals, exact-tuple human approval, single-use consumption, and final payment-executor revalidation on draft Slice 3 PR #2.
**Decision:** **CONTINUE (bounded development-only repair)**. The integrated Slice 3 Gate H / release remains **BLOCKED**, Slice 3 and Slice 4 remain unchecked, PR #2 remains draft. This decision does not authorize deployment or any PayPal Sandbox payout.
**Score:** **8.6/10** on the bounded repair scope. Not a release score.

## Evidence checked

- Source branch `build/slice-3-invoice-intake`, code commits `d16a8230cd6260aac0d49b2ccf5aaed3e07fb3a0` and `ff7b586a2a3ec3520385b7ebda06fbc4945a6566`, parent `7e2313ea0b0137ec82c4df49d2640974a05bcef3`.
- GitHub Actions push [38179421094](https://github.com/redasgard/mandategate/actions/runs/38179421094) and PR [38179424842](https://github.com/redasgard/mandategate/actions/runs/38179424842) succeeded for initial code repair: 42 test files / 228 tests, migrations and seed twice, typecheck, Next production build, authenticated smoke with zero payouts.
- GitHub Actions push [38179569412](https://github.com/redasgard/mandategate/actions/runs/38179569412) and PR [38179572404](https://github.com/redasgard/mandategate/actions/runs/38179572404) both succeeded for final code `ff7b586a`. Job `114589063108`: 19 migrations twice, seed twice, typecheck, **43 test files / 230 tests passed**, production build, same authenticated smoke; the smoke explicitly stated **zero payouts**.
- `src/payments/submit.ts` already applies historical AP risk to direct agent requests. New `src/authority/payment-proposal.ts` applies the same evidence before proposing a verified-invoice binding; `src/authority/binding-guard.ts` re-evaluates it at approval, consumption, and executor reads. `src/payments/executor/service.ts` fetches authoritative state again immediately before the PayPal gateway call.
- `tests/payment-proposal.test.ts` adds 7 PostgreSQL-backed regressions: imported paid invoice replay and immutable import references, confusable near-duplicate, late import before approval, late import after approval before consumption, late import after request before executor, foreign-organization isolation, and vendor-historical amount outlier. The pre-executor regression uses a **synthetic gateway spy** and asserts no gateway calls.
- `tests/ap-history-fail-closed.test.ts` adds 2 synthetic injected-client regressions: query outage rejects, and >2000 distinct paid rows yields `AP_HISTORY_WINDOW_INCOMPLETE`; no external payment network used.
- Existing original free Render `mandategate-web` / environment `evm-db39hoks728c73bpnqd0` was read-only inspected. Auto-deploy is off. Latest previously verified live deployment `dep-db5ub9l9fdbs73e58mug` serves older commit `2fbbdcd9ef8a284449c6035eae3dae41afe94f8a`. This incremental fix has **not** been deployed.

## Artifact scores

| Artifact | Score | Main weakness / scope limit |
| --- | ---: | --- |
| `src/history/anomaly.ts` | 8.2 | Complete-history data >2000 rows holds rather than a targeted indexed lookup |
| `src/authority/payment-proposal.ts` | 8.7 | Anomaly holds a binding before reviewer; human override requires a new explicit evidence-bound workflow |
| `src/authority/binding-guard.ts` | 8.5 | Final history snapshot check is not a serializable lock across the outbound network action |
| Admin proposal/reviewer UI | 8.7 | Signed-in evidence visibility is code/CI checked, not separately browser-tested on a live exact-code deployment |
| `tests/payment-proposal.test.ts` | 8.8 | Strong sequential integration regressions; dedicated adversarial concurrency/race fixture still needed |
| `tests/ap-history-fail-closed.test.ts` | 8.4 | Injected PG client proves helper behavior, not a full live outage through payment route |

Weighted rubric axes: correctness 8.4 (30%), requirement alignment 9.0 (20%), evidence and traceability 9.3 (20%), safety 8.4 (15%), completeness 7.6 (10%), maintainability 8.2 (5%). Weighted bounded-step score: 8.6.

## Findings

1. **MEDIUM - Race between final authoritative read and external Payouts POST.**
   - Evidence: `PostgresExecutionStore.getAuthoritativePayment()` invokes `inspectCurrentAuthorityBinding()` inside a short DB transaction, and `service.ts::submitClaimed` re-reads before `gateway.createSinglePayout`. The DB transaction does not hold a lock during the network call.
   - Impact: A concurrently imported paid record during this narrow interval is not proven to block the outbound request. Prior security gates already have analogous late policy/destination changes.
   - Repair: Before any claim of strict atomic issuer/payment invariant, design an explicit per-payment concurrency contract for the import/execution race and verify it with a barrier-controlled test; do not claim perfect serialization from the current tests.
   - Verification: Controlled concurrent import vs pre-submit executor run with exact gateway POST count and immutable decision trail.

2. **MEDIUM - Historical-risk anomaly resolution is fail-closed but not complete.**
   - Evidence: Pre-proposal replay/near-duplicate/outlier returns `ESCALATE` with null binding, and late anomalies cause `AP_HISTORY_REVIEW_REQUIRED`. Import-set truncation similarly holds authorization.
   - Impact: A legitimate payable invoice with conflicting historical evidence cannot complete the exact invoice T4 path until a documented bounded re-verification/override workflow exists. This is intentional for the current security increment, not a finished Slice 4 feature.
   - Repair: Implement approved human escalation investigation and evidence-backed resolution without allowing models or imported CSV to mutate trusted destination or clear deterministic DENY.
   - Verification: Admin sees source import IDs/hashes, cannot silently accept an anomaly, and the explicitly approved review decision is current, immutable, organization-scoped and binding-specific.

3. **MEDIUM - No external evidence for this new code.**
   - Evidence: CI used synthetic fixture issuer references, synthetic gateway spies, and mocked/inert historical outages. Original Render stays on older source SHA.
   - Impact: External issuer, Experiential ZDR/served GLM route, new durable webhook from invoice path and Sandbox invoice payout are **unverified**, so release and Slice3 acceptance remain blocked.
   - Repair: Meet independent Gate H external/privacy verification and explicit per-payout authorization, on exactly reviewed source and bounded deployment preflight.
   - Verification: Collect real external-provider receipts and user-approved Sandbox proof with exact commit/deploy IDs only after separate authorization.

## Requirement coverage

**VERIFIED by code and successful CI:** imported-history risk is evaluated for verified-invoice proposals and at all three subsequent authority-revalidation call sites; relevant risky histories block approval/consumption/payment; duplicate evidence references include import/source/row SHA-256; signed-in review UI renders current findings; database fixture cases exercise late imports and cross-organization separation; query outage/window-overflow failures do not return an ALLOW result; existing direct-agent CI path remains green.

**UNVERIFIED:** strictly atomic check against a history import racing the final external POST; full risk resolution UX; hosted exact-commit signed-in reviewer; live issuer authentication, Experiential organization ZDR/no-training served-model evidence, independent reviewer and a separately authorized invoice-originated Sandbox payout.

**INCORRECT claims to avoid:** "Slice 3/4 complete", "risk engine impossible to race", "production deployed", "real supplier verified", "model inference completed" and "invoice-originated PayPal proof achieved".

## Repair order and next gate

1. Preserve this bounded patch with CI and explicit provenance. Keep Slice 3, Slice 4 and later slices unchecked.
2. Prioritize approved dependency-independent next work in checklist order. Test the outstanding import/execution race before claiming stronger transactional guarantees, then implement historical-anomaly explanation/review.
3. Do not merge/deploy PR #2 or begin invoice payout proof until external Gate H release criteria, separate user authorization for Sandbox payout, and exact-code preflight are satisfied.

**Next gate:** bounded repair CONTINUE; integrated product release BLOCK, no staged or production payment authorized.
