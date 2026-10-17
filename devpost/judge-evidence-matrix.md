# MandateGate Judge Evidence Matrix

**Snapshot:** October 16 Pacific / October 17 UTC, refreshed after draft PRs #35–#39. **Status:** internal evidence index, NOT release acceptance, independent issuer verification, or Devpost submission confirmation.
**Current development head:** `build/slice-3-invoice-intake` at `e2506bd42633baa86dd1c845f098d074be525448`, **NOT DEPLOYED**. GitHub Actions push `38994299004` and PR `38994301931` failed before runner assignment with **zero job steps**, including one retry. This is an unverified runner/account failure, not proof of an app-test failure or pass.
**Latest independently verified LIVE app:** Render `mandategate-web` deployment `dep-db9djvqvcj2c73982edg` at `1c6d1711218d29faeacebbd45c76b46f96378474`, status LIVE; its push CI `38994013185` and PR CI `38994017722` completed SUCCESS. These runs covered migration/seed idempotence, typecheck, tests, production build and HTTP smoke; the previous **351 passing tests at a5586882** is historical evidence, not a fresh current test count.
**Draft changes:** PRs #35–#39 remain isolated and unmerged. Invoice-list hints and source-SHA match, judge-video script, CI trigger optimization, Devpost/judge-access docs, and stale direct/human payment authority repairs are **NOT deployed or CI-verified**. Draft-only static/read-only evidence must not be presented as release acceptance.
**Time sensitivity:** Recheck source commit, Render revision, provider events, org isolation, external judge account and video before final submission.

## What has actually been shown

| Judge-visible moment | Verification class / status | Evidence | Important limitation |
| --- | --- | --- | --- |
| Render serves the last CI-verified development application | **OBSERVED** hosted deployment + GitHub CI | Render `dep-db9djvqvcj2c73982edg` LIVE at `1c6d171`; CI `38994013185` and `38994017722` both SUCCESS. Current development head `e2506bd` is **not deployed**. | Hosted signed-in browser **visual** QA and safe external judge account not independently witnessed; newer PRs unverified |
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
| Stored original invoice artifacts | 4 |
| Independent PDF parser source pages | 0 |
| Verified `PDF_TEXT` T2 claim sets | 0 |
| Active non-synthetic enrolled origin channels | 0 |
| Current out-of-band human issuer attestations | 0 |
| T4 `AUTHORIZED` payment bindings | 0 |
| Original-SHA/consent-matched fictional GLM `ESCALATE` observations | 3 |
| Invoice-derived payment requests (`source='verified_invoice'`) | 0 |
| Any local payment-execution rows, all sources | 0 |

These values came from a new read-only SQL query, not a guessed extrapolation from old screenshots. The synthetic `SYNTHETIC_FIXTURE` channel is not genuine issuer provenance. Real independent T3 and exact T4 authorization are still missing, and strict account-level provider ZDR has not been established. **No new PayPal payout was initiated for this inventory.**

## Current release blockers and draft-only security work

- **External CI blockage:** GitHub-hosted `verify` jobs failed before any runner/steps on `e2506bd` and later draft PRs; no account-level root cause observed by the connectors. Do not buy minutes or change repo visibility without explicit owner action. See `devpost/gates/2026-10-16-actions-runner-blocker.md` in draft PR #37.
- **Stale payment authority hardening:** Draft PR #39 adds rechecks for an old direct `ALLOW` after policy shutdown/threshold changes/new PAID-history import, and for a human-accepted `ESCALATE` when new PAID-history risk appears or accepting admin membership is revoked. Its PostgreSQL fake-gateway tests are **written but not run**; independent financial/security review is required before merging.
- **Judge access:** The active login has public sign-up disabled, and signed-in `/demo` currently requires active `ADMIN` membership. There is no independently verified safe judge-only account; publicizing the development admin password is not acceptable. See draft PR #38.
- **Submission assets:** A five-segment 2:30 recording script exists in draft PR #36 but **no actual public video or Devpost submission** has been observed. Public `main` release, MIT license visibility, judge credentials, clean clone, restoration and release SHA checks remain open.

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
