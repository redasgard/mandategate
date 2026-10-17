# MandateGate Judge Evidence Matrix

**Snapshot:** 2026-10-16 Pacific / 2026-10-17 UTC. **Status:** internal evidence index, NOT release acceptance, independent issuer verification, or Devpost submission confirmation.
**Current checked branch:** `build/slice-3-invoice-intake`, code SHA `a5586882bf54dd383155722fb18da2cc0fbc99be`.
**External app:** Render `mandategate-web`, deployment `dep-db9cb8hsrm7s739ei99g` LIVE at exactly this code SHA, 2026-10-17T00:49:18Z.
**CI at deployed code:** push `38987835124`, PR `38987838738`, both SUCCESS; 63 Vitest files, 351 passing tests, migration/seed idempotence, typecheck, production build and signed-in HTTP smoke with zero payout executions.
**Time sensitivity:** Counts and hosted state are snapshots. Recheck source commit, Render revision, provider events and org isolation before a final video or judge submission.

## What has actually been shown

| Judge-visible moment | Verification class / status | Evidence | Important limitation |
| --- | --- | --- | --- |
| Render serves the current application | **OBSERVED** hosted deployment + GitHub CI | Render `dep-db9cb8hsrm7s739ei99g` LIVE; CI `38987835124` and `38987838738` | Authenticated browser **visual** QA not independently witnessed |
| Real GLM-5.3 Flash observed fictional invoices | **OBSERVED** stored provider request metadata in live demo; **SUPPORTED** prior hosted provider call | `app/demo/vision-evidence.tsx`, `src/demo/evidence.ts`, synthetic consent table, `devpost/decision-log.md`, strict vs synthetic privacy runbook | T1 ESCALATE only; consented non-ZDR route **does not** mean strict account ZDR; invoice source / issuer / payout authority remain unverified |
| Three deterministic canonical decisions | **VERIFIED** signed-in CI + previous hosted HTTP replay; present in server-rendered demo | `src/demo/scenarios.ts`, `src/demo/scenarios-store.ts`, `scripts/verify-hosted-demo.mjs`; normal ALLOW, unusual amount ESCALATE, altered payee DENY | Synthetic seeded cases, **not** parsed from the GLM PDFs, and `MANDATEGATE_DISABLE_PAYMENTS=1` |
| Actual document upload, parser and T2 field-review controls | **VERIFIED** isolated authenticated CI; **UNVERIFIED** genuine live invoice/issuer | `scripts/smoke.ts`, `src/invoices/pdf-source-store.ts`, signed-in `/invoice-artifacts` | Parser can quote the PDF but not authenticate sender; T3 actual out-of-band issuer proof absent |
| AP CSV import and near-duplicate/amount anomaly | **VERIFIED** synthetic DB and local HTTP CI; **UNVERIFIED** completed hosted optional import click | `/ap-history`, tests and `devpost/checklist.md` Slice 4 | The three seeded judge examples are **not** derived from that uploaded AP history |
| Destination substitution safety | **VERIFIED** simulated signed-in HTTP and core policy tests | Signed-in `DENY`, reason `DESTINATION_MISMATCH`, T2/T3/T4 guards | A controlled CI simulated portal record is **not** a genuinely verified external vendor response |
| Historical PayPal Payouts + webhook/reconciliation | **RECORDED/REVIEWED** earlier real Render and PayPal Sandbox execution | [Historical build ledger](https://github.com/redasgard/mandategate/blob/be8ba53e410ad74160fdc9d8931f2aa16d299e0c/devpost/build-state.md#L255-L265) and [Slice 2 critical review](https://github.com/redasgard/mandategate/blob/be8ba53e410ad74160fdc9d8931f2aa16d299e0c/devpost/reviews/slice-2-critical-review.md); `src/demo/historical-sandbox-proof.ts` | The earlier direct trusted-agent payout is not GLM-to-PayPal, not current Neon evidence, not freshly re-queried from PayPal in this demonstration |
| Full AI-derived invoice reaches PayPal | **BLOCKED** | `devpost/gate-h-live-runbook.md`, `devpost/gates/2026-10-16-g2-readonly-inventory.md` | Strict full-ZDR, independent live T2/T3, authorized T4 tuple, explicit owner one-off Sandbox grant and verified reconciliation absent |
| P1/P2 sponsor features and external anchor | **NOT ACCEPTED** under 13-slice checklist | `devpost/checklist.md`, `devpost/october-2026-execution-plan.md` | Architecture target is not a successful integration or license entitlement |

## Historical Sandbox receipt, strictly separate from the current demo

- Earlier logical payment: `ff515077-bf90-4800-80d7-3ef8f33d6ee2`.
- Sandbox payout batch: `BA7V96FCY8Z64`; item `A3R9LWD8XTX72`.
- Historical final observation: remote PayPal `SUCCESS` / local `PAID`, one submission, one verified webhook, two reconciliations, zero reconciliation failures.
- The original evidence is a **previous Render deployment**, not the Neon-backed judge database. It was already used for a separate trusted-agent direct-payment proof. The current signed-in demo displays *archived metadata only*.
- **No new PayPal payout or payment verification was triggered by presenting this artifact.**

## Latest connected Neon inventory (read-only check 2026-10-17 UTC)

| Demo organization `org_demo` | Observed |
| --- | ---: |
| Saved consented fictional GLM ESCALATE observations | 3 |
| Invoice-derived payment requests (`source='verified_invoice'`) | 0 |
| Any local payment-execution rows | 0 |

The earlier G2 inventory also found 0 verified T2 PDF-text claim sets, 0 active non-synthetic enrolled issuer channels, 0 pre-existing non-synthetic issuer channel × stored-invoice pairs, 0 current T3 authentications, 0 T4 authorized bindings. That snapshot predates later parser automation; it must not be reused as current page-count proof without re-querying. A synthetic `SYNTHETIC_FIXTURE` origin channel does not establish genuine issuer provenance.

## 2:30-minute judge story (subject to actual video capture)

1. **0:00–0:20** Agent requests vendor payments, but MandateGate owns authorization and the PayPal executor.
2. **0:20–0:55** Inspect consented fictional GLM T1: observed invoice facts, source SHA, model metadata and why the document cannot authorize a transfer.
3. **0:55–1:40** Run/replay independent deterministic `ALLOW`, `ESCALATE`, `DENY` scenarios and show source-backed reason codes. No PayPal submission.
4. **1:40–2:10** Inspect the **separate historical** direct trusted-agent PayPal Sandbox receipt with one actual batch/item and reconciled status. Explicitly say it does not arise from the GLM PDF.
5. **2:10–2:30** Conclude with negative authority boundary, historical AP optional proof, and what remains blocked.

This is a proposed script only. It does not substitute for a public YouTube recording, independently witnessed signed-in UI, publicly accessible code, or the actual Devpost confirmation.

## Submission blockers beyond code

- [ ] Final code to public `main`, source/tag parity and clean clone verified. Development branch `a5586882...` is **not** on `main`.
- [ ] Hosted judge credentials/access securely provisioned without embedding passwords or payout permissions in public docs. Separate test sessions exercised.
- [ ] Signed-in visual walkthrough and links inspected; safe three-case replay repeated with zero outbound payouts.
- [ ] Durable judge database / restore and service longevity through December 15 verified.
- [ ] Public YouTube video **under three minutes**, shows current actual hosted behavior.
- [ ] Project source/public MIT license/Devpost content and confirmed published entry URL independently checked by **October 29, 6 PM Pacific**.
- [ ] Final independent security review of financial changes and accurate descriptions before release.

**Never** treat a green unit suite, this document, or old Sandbox IDs as complete Gate H, external issuer verification, active provider ZDR, fresh PayPal settlement or submission-ready status.
