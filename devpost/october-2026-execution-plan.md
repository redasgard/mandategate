# MandateGate | October 2026 Completion and Submission Plan, Revised v3

**Status:** REWORKED PLAN / G0 BLOCKED; conditional execution baseline, not a certification of staffing, external service access, Gate H, or completed release.  
**Planning snapshot:** October 14, 2026, Pacific time.  
**Target:** Submit by **Thursday, October 29, 2026, 6:00 PM PT**, before the user's end-of-October deadline.  
**Emergency-only buffer:** October 30-31.  
**External Devpost deadline (verified October 14 in the earlier review):** November 12, 2026, 12:00 PM PT. Recheck on publication.  
**Supersedes:** `MandateGate_October_2026_Completion_Plan.md` v1 and its embedded 8.7/10 self-approval.  
**Critic basis:** `MandateGate_October_2026_Critical_Review.md`, dated October 14, decision **BLOCK**, score **7.3/10**.  
**Authoritative product scope:** `devpost/scope.md`, `devpost/prd.md`, `devpost/spec.md`, `devpost/checklist.md`. The approved P0/P1/P2 targets are unchanged by this document.

## 0. Executive contract: what this plan does and does not promise

1. **Finish before November:** October 29 is the planned *completed submission* date, not merely a code freeze. October 30-31 are not scheduled development days.
2. **Target every approved slice:** Slices 1-13 remain in scope, but **unassigned capacity and unverified third-party access are blockers, not resources that can be wished into existence**. Full-scope October delivery must pass Gate G0-CAPACITY before it is called committed. An owner-approved scope change, if needed, is documented as a decision; never silently remove work or report unfinished work as done.
3. **Financial integrity is non-negotiable:** The agent, invoice, LLM, Assistant, search, dashboard, and external integrations have no standalone payment authority. A model can observe, explain, recommend, or increase caution; only deterministic policy and verified authority can issue an exact allowed payment.
4. **Two evidence contracts:** The one-shot external PayPal Sandbox proof and the repeatable judge interaction are deliberately different products. Neither is portrayed as the other.
5. **One source of truth:** Publish this plan under `devpost/october-2026-execution-plan.md` on a reviewed documentation branch, then reconcile and merge the active `devpost` checklist, status, decision log, runbook, and README. Do not create an alternative contradictory top-level requirements system.
6. **Release from `main`, not just a development branch:** Clear PR #2, merge, tag, clean-clone, verify the tagged tree and deployed revision, then publish. A public repo pointing to Slice 2 while Render runs Slice 3+ is not a release.
7. **Not yet verified:** Real Experiential synthetic inference, invoice-derived Gate H payout, repeatable judge journey, P1/P2 implementations, December database continuity, human security signoff, and Devpost submission.

### Verified baseline, October 14

- Repository: private `redasgard/mandategate`; MIT license. `main` contains completed Slices 1-2 at `afab57dc9fca4c87f4f26eee4669e977c6eadbfa`.
- Draft, unmerged PR #2: `build/slice-3-invoice-intake` at `be75fecf9cf0bff1deaecabf450888424088a51b`. Slices 3-7 contain meaningful partial code, but remain unchecked; 8-13 mostly planned.
- Development Render `mandategate-web`, service `srv-db39vmm7bikc73c55nh0`, is **LIVE** on that development SHA, deploy `dep-db7b28m0tbcc73bm2d50`.
- GitHub CI for that SHA: 47 test files and 259 tests passed; migration and seed replay, typecheck, build and local signed-in synthetic HTTP smoke passed, with **zero** CI Sandbox payouts.
- Completed Slice 2 genuinely proved one earlier PayPal Sandbox payout, reconciliation and webhook reception. That is **not** invoice-derived Gate H proof.
- The single-development-environment strategy uses PayPal Sandbox and fictional invoices. The existing free Render PostgreSQL service `dpg-db39d5rbc2fs73d1ke70-a` reports expiry **November 6, 2026**; demonstrable availability through December 15 judging requires migration/upgrade and tested restoration.
- The current synthetic invoice lane is restricted to approved source SHA-256 values, active same-organization admin, explicit consent, demo-bound Render service and Sandbox. Provider ZDR/no-training/prompt-capture protections are **optional only for this synthetic lane**, not for normal or production-style invoice observation.
- The GitHub development checklist is **stale** on that final point. Reconcile it before updating Slice 3 status.

## 1. Revisions mapped exactly to the critic's repair order

| Critic finding | Plan repair | Artifact / proof | Deadline |
| --- | --- | --- | --- |
| H1: Unverified capacity | Explicit named-owner roster, per-packet engineering estimates, capacity arithmetic, dependency/WIP gates, independent QA/release allocation | G0-CAPACITY signed staffing and availability ledger | Oct 14, before full-scope commitment |
| H3: One-shot payment vs judge replay | Separate `SANDBOX_PROOF` and `JUDGE_REPLAY` contracts; no new payout in repeatable judge route; optional explicit BYO Sandbox new-payment workflow not presumed | Two independent HTTP/evidence test scripts and public judge instructions | Contract Oct 15; hosted proof Oct 20 |
| M1: Free-account GLM metadata/receipt | Optional metadata endpoint handling for synthetic only; unknown/null != false; persist safe provider receipt + request IDs + SHA, verify served model; strict route fail-closed | Real response plus DB evidence, strict regression, no image sent for unallowlisted SHA | Oct 15 |
| M2: Contradictory docs / no committed plan | Canonical plan under `devpost`, scoped checklist, decision log, build state, README/runbook reconciliation | Reviewable docs branch, CI/checklist consistency, merge after review | Oct 16 |
| M3: Autonomous ALLOW vs human approval | Distinguish preauthorized trusted-ingress standing mandate from one-shot human-approved safe test; preserve T2/T3 origin verification | Separate auto-ALLOW, manual escalation, hard DENY tests | Oct 17-20 |
| M4: Sponsor access / budget | Provider-by-provider entitlement and license matrix, test tokens, spend approvals, capability gates, fallback decisions | G0-ACCESS receipts, no unverified integration counted complete | Oct 14-15 |
| M5: Security review / soak | Freeze money/schema interfaces before Oct 24, independent human review of final money-moving diff, two full hosted three-case replays, clean clone | Reviewed security signoff, exact SHA traces, candidate soak | Oct 23-27 |
| H2: Default branch mismatch | Add mandatory **G7a release cutover**: PR review/merge to `main`, release tag, fresh-clone test, Render/main tree parity, post-merge smoke | Merge/tag/deploy proof | Oct 27 |
| L1: Unsupported earlier self-approval | Replace previous `CONTINUE 8.7` with critic's `BLOCK 7.3`; re-review this revised plan independently if possible | Revised critic gate in Section 13 | Before approving entire execution plan |

## 2. G0-CAPACITY: staffing and honest throughput model

### 2.1 Named-accountability sheet, not invented assignments

No external engineer, dedicated QA person, or reviewer has been confirmed as allocated to the project in the inspected evidence. The following are **roles to fill**, not fictitious people. G0 must replace each UNASSIGNED entry with an actual person/available execution lane and exact dates/hours.

| Track | Accountable owner at planning time | Planned work | Estimated focused engineering days | Must not share / prerequisite |
| --- | --- | --- | --- | --- |
| A: Money & trusted input | **UNASSIGNED A** | GLM/T2-T4, AP history, vendor trust, Gate H, P0 fixes | 7-10 | Protected payment code and authority schema; reviewer signoff |
| B: Product control plane | **UNASSIGNED B** | Dashboard/AG Grid, policy lifecycle, Assistant, prepared actions, Bryntum | 7-10 | Uses reviewed A action contracts, never direct PayPal calls |
| C: Integrity & persistence | **UNASSIGNED C** | Audit chain/Merkle/Base Sepolia, DB continuity, Elastic read projections | 5-8 | Event schema approved before anchor or index adapters |
| D: External integrations/evaluation | **UNASSIGNED D** | Zapier/Postman, Qwen/Jev/Laya fixture comparison, sponsor proof | 4-6 | Provider entitlements verified; no standing finance authority |
| Q: QA & release coordinator | **UNASSIGNED QA** | CI, hostile tests, hosted replay, security review coordination, clean clone, video, Devpost | 4-6 | Independent of feature implementation as far as practical |
| O: Operator/account owner | **OWNER CONFIRMATION REQUIRED** | Account access, privacy disclosures, DB expense, exact Sandbox payment grant, publishing rights, acceptance | Variable; scheduled decision windows | Cannot be silently performed by engineering role |
| S: Independent security reviewer | **UNASSIGNED REVIEWER** | Final diffs touching payment, auth, database trust and schedules | Review allocation required by Oct 23 | No self-certification of final money movement |

**Estimate interpretation:** The prior plan's **21-33 engineer-days** was a lower-confidence baseline. The four implementation work packets above sum to **23-34 focused engineer-days**; QA/release adds **4-6 days**, giving **27-40 combined days before contingency**. Calibrate ticket estimates at G0 and reserve at least **20%** additional implementation and QA/release capacity (high-end requirement: approximately **41 implementation days plus 8 QA days**). This is not booked capacity or evidence that a reviewer exists.

**Critical capacity arithmetic:** October 14-26 contains **nine weekdays** (October 14-16, 19-23, 26) and four weekend days. Four fully available implementers offer a *theoretical* **36 implementation days on weekdays**, or **44 if two extra weekend days are actually staffed**. At the high estimate, implementation needs **34 × 1.2 ≈ 41 days** before freeze, leaving almost no slack with the weekend plan. One dedicated QA/release lane covering at least **8 effective days** is additional, not part of those 44. These are gross capacity ceilings; context switching and integration friction can make actual capacity lower. Four lanes and weekend coverage have **not** been confirmed. One or two implementers cannot credibly promise every approved slice inside this window.

### 2.2 G0 hard go/no-go, October 14 by end of day Pacific

- [ ] Named actual owners assigned to A/B/C/D/Q/S and operator decisions; each confirms date-by-date availability and non-overlapping responsibility.
- [ ] Actual available implementer-days **greater than or equal to the calibrated work forecast including at least 20% integration/rework reserve**, before Oct 27; QA/release capacity booked separately.
- [ ] External payment/AI/license entitlement matrix verified (Section 3); unknown access is marked BLOCKED.
- [ ] Protected shared-schema/payment API change windows and code ownership established; **one WIP task per lane**, at most **two concurrently integrating feature branches**.
- [ ] Schedule identifies blocking operator slots for Oct 15 (GLM/demo), Oct 18 (payout only after dry run), Oct 20 (hosted UX), Oct 27-29 (public release/submission).

**Decision if unstaffed or arithmetic fails:** G0-CAPACITY = **BLOCK for unconditional full-scope promise**. Safe diagnostics and existing P0 repair can continue. The project owner must explicitly authorize either more verified capacity, revised estimates backed by measured acceleration, or specific deferrals. Silence is not scope approval. The October 29 target stays unchanged unless the owner explicitly changes it.

### 2.3 Shared contract and integration sequencing

`Hosted fictional invoice -> provider T1 -> independent source T2 -> authorized origin/standing trusted ingress T3 -> deterministic authority T4 -> frozen tuple -> idempotent Payouts`. This is the **A critical path**.

Parallel work only after stable interfaces:
- B can build read-only dashboard, policy proposals and Assistant queries immediately; confirmation actions depend on A's exact action digest and versioning.
- C can implement local event canonicalization/verification and backup/restore immediately; external anchoring depends on the approved event schema.
- D can verify accounts, build read-only adapter clients, fixture harnesses and API documentation immediately; real external integration only after credentials and access are proven.
- Q writes judge-mode tests, documentation, security/checklist gates and repeatable video script continuously, not just after feature freeze.

## 3. G0-ACCESS: capability, permissions and spending matrix

The following is an acceptance checklist, **not a claim that entitlements exist**. A provider without test credentials or a valid license is BLOCKED; never call a mock a completed sponsor integration.

| Dependency | Technical proof required | Access/owner state | Budget and fallback rule |
| --- | --- | --- | --- |
| Experiential Labs GLM-5.3 Flash | Actual model list, Free-plan metadata availability, one request ID and strict-schema response | API account in current demo; **successful serving unverified** | Synthetic-mode privacy disclosure; determine permitted route by Oct 15; do not quietly switch models |
| PayPal Sandbox Payouts | Existing provider config, exact approved receiver/amount, item and verified webhook | Slice 2 verified; Gate H still **requires separate explicit grant** | Only previously agreed $1.01 single-shot proof, no automated judge charges |
| Render Web/PostgreSQL | Live service, restored DB with availability through Dec 15, no unplanned paid staging | Web LIVE, free DB expires Nov 6 | Operator approves actual recurring DB cost or durable replacement before migration |
| AG Grid/AG Studio | Compatible SDK build, license terms, actual render | **Unverified** | Free/legal capability where eligible; license not presumed |
| Bryntum | Licensed evaluation/use permitting submission/demo, working timeline | **Unverified** | Owner authorizes fees or written feature substitution/deferral |
| Base Sepolia | Wallet with test ETH, deploy/access proof, registry tx and independent verifier | **Unverified** | Budget-gated testnet only; no raw business data on chain |
| Elastic | Test instance, authenticated index/rebuild, outage simulation | **Unverified** | Free/evaluation tier if allowed; PostgreSQL remains authoritative |
| Zapier MCP | Connected account/tool permission, successful scoped API submission | **Unverified** | External agent cannot gain admin/payment authority |
| Postman | Public-safe collection and replay, authorized workspace | Local JSON implementation possible; publication **unverified** | No secrets in public workspace |
| Qwen/Jev/Laya | Exact provider/model identifiers, API entitlement, terms, bounded fixture evaluation | **Unverified** | Explicit owner approval for any substitution; no inferred model support |
| Source/video publication | Repo license/IP rights, video media rights, account access | Repo PRIVATE; publication **unverified** | Secret/IP review before exposure |

**Record for every provider:** named owner, endpoint/model/SDK ID, license permission, intended spend ceiling, actual cost estimate, credential configured in secret manager (not document), success/error receipt, fallback decision and due date. All ceilings and operator approvals are TBD until verified; the plan author does not approve spending.

## 4. G1: GLM synthetic Free-account route and evidence contract (October 15)

### 4.1 Mandatory controls irrespective of paid provider features

- Exact **original-file SHA-256** matched to server-managed fictional-fixture allowlist before image bytes leave Render; no arbitrary admin-uploaded real document becomes synthetic merely via checkbox.
- Bound Render demo service, `MANDATEGATE_DEPLOYMENT_ROLE=demo`, explicit feature flag, PayPal **Sandbox** host, authenticated active org ADMIN, same-origin POST, checked consent with plain-language potential provider retention/logging/training.
- Immutable consent record is durable before any external transmission and keyed to actor/org/artifact/original SHA. Analysis always advisory; synthetic result forces `ESCALATE`, `paymentAuthorized=false`, `paymentExecuted=false`.
- Actual served model identity must equal `glm-5.3-flash`, with strict JSON response schema and no ignored required parameters; failure of these guards blocks inference success.

### 4.2 Metadata semantics and route split

| Signal | Synthetic demo route | Default/strict route |
| --- | --- | --- |
| Organization identity and model entitlement | Must positively verify identity and correct model before inference | Mandatory |
| Account zero retention | Optional, but record `true`, `false` or `unknown` | Mandatory true and non-partial |
| Provider no-training enforcement | Optional, record `true`, `false` or `unknown` | Mandatory true |
| Prompt-content capture disabled | Optional, record `true`, `false` or `unknown` | Mandatory true |
| Individual optional provider metadata API returns 401/403/404 | Do not claim false/compliant; classify as `unavailable`/`unknown`, disclose, and proceed **only** if provider use is permitted by contract and all mandatory controls pass | Fail closed before image transmission |
| Model list/identity route unavailable | Fail closed | Fail closed |
| Actual inference `x-gateway-zdr` header absent | Record actual `unknown`; never assert ZDR | Fail closed |
| Output model mismatch/ignored schema | Fail closed, no trusted result | Fail closed |

**Implementation ticket:** Replace unconditional `Promise.all` provider-privacy fetch failure behavior with separate mandatory vs optional metadata retrieval, synthetic-only typed absence (`unknown` ≠ `false`), strict route unchanged; never swallow generic auth failures that prevent confirming the account/model or the provider's permission to process these test bytes.

**Persistence ticket:** The current invoice analyzer does not durably retain the full preflight receipt. Add a sanitized, append-only/integrity-bound privacy evidence record linked to organization, original SHA, rendered image SHA, actor/consent ID, model, request ID, retrieval timestamps, each metadata outcome, serving ZDR header value, schema contract result, and `syntheticNonZdrTest`. Do **not** persist tokens, raw prompts, real invoice data, or assert guarantees not enforced. Distinguish `retrieved_false`, `retrieved_true`, `unavailable`, and `missing` from request failures. Record error receipts even when preflight blocks without transmitting an image.

**Acceptance:** (1) real Free-account model request for one approved fixture; (2) original + rendered SHA; (3) gateway request ID/served model proof; (4) stored and inspected receipt showing precise unknown/false/true; (5) unallowlisted bytes transmit nothing; (6) strict standard path blocks noncompliance; (7) no PayPal calls. If provider terms disallow test-data handling without those controls, do not bypass them: stop and seek explicit alternative approval.

## 5. Payment demonstration contract: SANDBOX_PROOF versus JUDGE_REPLAY (lock by Oct 15)

### 5.1 SANDBOX_PROOF: one independently authorized external payment

- Separate operator permission is required **after** a non-mutating Gate H preflight; this roadmap confers no payment authority.
- Pin exact fictional ALLOW fixture, organization, original SHA, verified/authorized T2/T3/T4 tuple, `USD 1.01`, and an expressly approved Sandbox Personal receiver. Keep the grant short-lived and disable it immediately after the single permitted POST.
- Confirm logical payment count, physical Payouts POST count, stable PayPal request/batch/item IDs, webhook signature/receipt, final reconciliation and the absence of any ESCALATE/DENY POST.
- Retain a sanitized immutable-ish evidence packet and viewer-accessible historical receipt accurately labeled **real historical Sandbox transaction**. Replay idempotence is allowed using the same original IDs only if it cannot create a second payment.
- A trusted supplier in synthetic fixtures must be correctly classified as **controlled test origin**, not falsely reported as a contacted real vendor.

### 5.2 JUDGE_REPLAY: repeatable safe product interaction, no fresh payout

- Provide a dedicated restricted demo/judge role and isolated fictional test organization or per-session logical fixture namespace; enforce per-organization access and rate limiting. A judge cannot obtain reusable credentials that grant PayPal API authority.
- Judge action: reset the **presentation/test state** of the three fictional invoices, submit or explore a fictional invoice, see actual deterministic evaluation and reasons, navigate evidence, and prepare review decisions without crossing an outbound PayPal boundary. A judge reset must not mutate or erase immutable consent/provenance/financial evidence.
- Normal-case UI has an explicit split: `ALLOW / ready for execution` (fresh deterministic decision, **no outbound payment** in replay mode) and `Historical Sandbox proof` (recorded authentic transaction with its original timestamp and identifiers). Never label historical receipt as a fresh payout or claim that a replay settled again.
- ESCALATE and DENY run their actual deterministic risk logic and prove zero outbound Payouts submissions.
- The replay is repeatable twice from public instructions with predictable reset behavior and no unintended external model calls; live model inference, if exposed to judges, requires its own disclosed fictional-fixture consent, quotas and an isolated allowlist.
- Judge credentials can expire/revoke and remain available (or reproducible by self-setup) until the end of judging, including **December 15**. No production credentials or customer material.
- **Optional separate BYO_SANDBOX integration test:** A judge may configure their *own* credentials and approve a new limited Sandbox payout in a separate self-hosted environment, but this is not a guaranteed hosted free-testing feature and is not required for the repeatable demonstration.

### 5.3 Autonomous known-vendor ALLOW must remain real in policy semantics

- **Standing mandate / trusted ingress:** A normal, independently source-authenticated synthetic invoice, inside an already-approved vendor/amount/policy mandate, can become deterministic `ALLOW` without a fresh generic admin approval. The model cannot grant this standing authority.
- **Fresh review:** An exceptional invoice moves to `ESCALATE` and requires a distinct authorized admin explanation/approval, provided no hard block exists.
- **Proof-only payment:** The one-shot SANDBOX_PROOF intentionally adds an **operator grant** before the external Sandbox POST; this special test fence is not evidence that routine ALLOW always needs an administrator.
- **Hard DENY:** Destination substitution, mismatched immutable tuple, unauthorized principal or inconsistent source cannot be cleared by an ordinary approval.

**Acceptance matrix:** trusted-standing-mandate ALLOW with no fresh generic admin click; controlled manual escalation with exact approval and reason; hard destination DENY; one-shot actual PayPal evidence; at least two judge replay sessions producing no outbound payouts and no misleading receipt labels.

## 6. Dependency-aware execution plan, October 14-29 PT

### 6.1 Binding interpretation of dates and scope

- **October 29 at 6 PM PT is the target for a *confirmed completed Devpost submission***, not an October 28 code freeze followed by submission November 12. November 12 at noon PT remains the external Devpost deadline and must not be mistaken for planned working time. October 30-31 are emergency-only. All dashboard/checklist/status copies must use this contract.
- P0/P1/P2 and all thirteen slices remain approved *targets*. An unavailable sponsor, a missed gate, or insufficient engineering capacity does **not** silently authorize deletion, substitution, or a completion claim. An explicit owner decision with the affected acceptance criteria is required.
- Dates are **conditional exit targets**, never permission to waive safety, reviews or payment authorization. The staffing/critical path gate can return BLOCK for the full-scope date while allowing bounded, non-mutating diagnostic work.

### 6.2 Critical path, resource constraints and capacity gate (repair H2/H6)

Critical path A: external GLM entitlement + consent/receipt (G1) -> immutable original invoice / field-source T2 verification -> truthful independent-or-controlled-origin T3 classification -> T4 exact authorization tuple -> hostile input and tenant/race regressions -> operator-authorized one-shot Sandbox Gate H -> webhook/reconciliation evidence -> hosted normal/ESCALATE/DENY -> safe judge replay -> independently reviewed financial integration -> tagged main/Render parity -> published submission.

Critical path release: database restore/continuity -> agreed event/payment schema -> first clean-clone + preview parity rehearsal -> security-frozen candidate -> independent security reviewer -> final main/tag/Render smoke -> public-safe release. Critical path demo: separation of GLM advisory evidence and authorization -> first recorded rehearsal -> correct historic receipt labeling -> final sub-three-minute video.

**Track-specific workload tests, not gross capacity arithmetic alone:**
| Lane | Remaining estimate at planning | Blocking dependencies | Required G0 evidence |
| --- | --- | --- | --- |
| A money/source/Gate H | 7-10 focused days + >=20% per-lane reserve = 8.4-12 | Provider account, issuer/T2-T4, one-shot grant, review, live webhook | Named owner(s), actual time slots, measured ticket burn-down, working-day critical-path slack |
| B UI/policy/schedule | 7-10 + reserve = 8.4-12 | A frozen action digest, policy/trust version contract | Owner and availability; no parallel authority mutations |
| C integrity/DB/Elastic | 5-8 + reserve = 6-9.6 | Event contract, migration/restore and external access | Owner and restoration operator; exact verification receipts |
| D integrations/models | 4-6 + reserve = 4.8-7.2 | Sponsor licenses, endpoints, non-authoritative interfaces | Owner, entitlement proofs and fallback decision |
| Q QA/release | 4-6 + reserve = 4.8-7.2 | Independently testable hosted candidate and clean checkout | Distinct QA allocation; independent financial reviewer schedule |

**Feasibility warning:** October 14-20 gives A only seven calendar days, versus 8.4-12 estimated effective days *without* an actual staffed parallel split. Therefore the published Oct 18/20 Gate H/P0 dates are **aspirational and not a feasible committed schedule** until A's measured remaining tickets, explicit weekend capacity and predecessor gates produce nonnegative slack. Four hypothetical engineers do not resolve serial dependencies. The plan may not claim G0 PASS from total engineer-days alone.

At G0 calculate each lane's actual effective available days through its own latest safe integration cutoff, deduct meetings/rework and signed reviewer/operator windows, identify longest serial chain, and show >=20% reserve *on every constrained lane*. Record estimated-versus-observed progress daily. If A does not fit, full-scope Oct 29 remains BLOCKED. No fictional people or unapproved paid resources.

### 6.3 Latest safe integration dates and dependency contracts (repair H3)

| Scope | Earliest independent work | Latest safe integration target | Mandatory gating |
| --- | --- | --- | --- |
| P0 GLM + invoice T2/T3/T4 / Gate H | Now, diagnostics and tests only until compliant | Oct 20, **only after** Gate H evidence | No model/fixture grants payment authority; separate operator payout consent |
| P0 hosted flows + safe judge replay | After A deterministic contracts stable | Oct 22 | Two isolated judge sessions; zero new outbound PayPal POST; historic payout receipt labeled |
| P1 AG Grid read-only and dashboard | Now | Oct 22 | Tenant isolation, actual nonfabricated balances; fail closed/degrade safely |
| P1 Assistant/policy prepared actions | Read-only scaffolding now | Oct 23 noon **before** money/schema freeze | Revoke, stale state, digest, tenant and hostile text tests |
| P1 scheduling / Bryntum | Read-only UI now; execution after A contract stable | Oct 23 noon | Due runner and cancellation races, no bypass of execution-time revalidation |
| P1 Base Sepolia/verifier | Canonical hash tests and restore now | Oct 24 | Independent chain receipt, tamper -> BROKEN, no sensitive data on chain |
| P2 Elastic | Projection adapter now | Oct 24 | Rebuildable, downtime safe, read-only and no authoritative risk override |
| P2 Zapier/Postman | Scoped contract/docs now | Oct 24 | Real external actor proof, no admin/payment elevation |
| P2 Qwen/Jev/Laya | Isolated fixture testing now | Oct 24 | Exact model/entitlement and bounded monotonic-evidence verdict |

**Freeze semantics:** Oct 23 noon locks shared authority, executor, approval, schedule and event contracts. No unfinished consequential component is merged after that point merely to hit its target. Emergency security repairs reopen impacted contract review/tests. Optional integrations must be complete and independently verified by their listed cutoff to enter the release candidate; otherwise the owner records an explicit feature deferral or deadline/capacity change (no silent cuts).

### 6.4 Demo truth contract and early rehearsal (repair H4)

**Do not imply a non-ZDR fictional GLM observation authorized a payout.** The permitted synthetic Free-account route is consented, SHA allowlisted, advisory **T1 only** and forcibly `ESCALATE`, with `paymentAuthorized=false` and `paymentExecuted=false`. Showing it next to ALLOW is not proof of a causal payment chain.

Use two separately labeled tracks:
1. **AI observation:** true external `glm-5.3-flash` inference on approved fictional bytes, actual served model and privacy metadata (including false/unknown), bounded invoice claims, immutable consent/receipt; clearly label advisory / escalation-only.
2. **Financial authority + PayPal:** independently grounded T2/T3/T4 canonical source, trusted destination, existing standing mandate, deterministic ALLOW, plus a **separately granted** one-shot historical Sandbox proof. Label its real timestamp, payout identifiers and the fact that replay does not settle money. Do not claim real supplier contact where only a controlled fictional channel exists.

Rehearse both paths and their transitions by **October 21** with truthful placeholders for any still-unverified external evidence; record the first screen capture, failure points and elapsed time. Final script must be reviewed against actual receipts and runtime state before publication. An externally unverified feature is omitted from the video or disclosed as planned, never filmed as operational.

### 6.5 Advance release integration and QA (repair H5)

By **October 21-22**, run a *non-public release-cutover rehearsal* on the review candidate: evaluate PR #2 against main, review money/tenant/schema diff, clean checkout, frozen install, migration twice, synthetic seed twice, signed-in HTTP tests, sandbox-host restriction and Render preview/equivalent tree-parity evidence. Back up and restore the DB before migration branch switch. The rehearsal does **not** authorize merging an unreviewed security-sensitive PR or creating a payout.

By October 23, reconcile failed rehearsal outcomes and enter the shared money/schema freeze. By October 24-26, perform bounded concurrency tests, external outage/failure injection, restart/receipt recovery, judge reset/idempotency tests and two complete hosted three-case replays. Obtain independent financial-diff reviewer availability **before** the freeze; no self-review substitution. Oct 27 final review/merge/tag is only a narrow confirmed release cut, not first integration. Every fix to frozen authority code demands new review and revalidation.

### 6.6 Daily execution sequence: October 14-29 PT

The work is concurrent only under a staffed G0. Dates are **exit targets**; each packet has a named technical owner as soon as G0 confirms the roster. Do not treat an upcoming date as evidence its gate has passed.

| Date | Track A: P0 and trust | Tracks B/C/D: independent work | Track Q / operator / stop condition |
| --- | --- | --- | --- |
| **Wed Oct 14** | Snapshot baseline, investigate Free GLM preflight, inventory Gate H source/attestation deficiencies | Capability/license matrix; dashboard data adapter, receipt schema and chain interface design; DB export plan | **G0 hard staffing and access gate**; assign actual owners, validate capacity math and operator windows; plan docs work starts |
| **Thu Oct 15 (conditional)** | Implement synthetic optional-metadata semantics, run real GLM fixture, persist truthful receipt | Verify sponsor accounts/SDKs; implement test/replay mode UI/API contract; DB export and tested restore | **G1** external request or explicit BLOCK; two-mode judge/test specification signed; costs approved if any |
| **Fri Oct 16** | Finish source T2 verification, controlled T3 evidence and frozen binding T4 integration; no money POST | Read-only AG dashboard; policy proposal and event interfaces; API collection and model evaluation harness | Merge **documentation-only plan repair** after review; checklist/runbook/decision log/readme aligned; payment mode fixture spec frozen |
| **Sat Oct 17** | Hostile source/history/destination, stale approval, tenant, concurrency and prompt-injection preflight | Assistant evidence query, policy editing; independent hash chain unit tests | **G2-PREFLIGHT:** one positive and two negative causal fixtures, exactly zero PayPal network calls |
| **Sun Oct 18 (aspirational; only if all prerequisites pass)** | After fresh exact operator authorization, one $1.01 invoice-derived PayPal Sandbox submission; receipt + webhook/reconciliation | Continue read-only policy/AG view, chain checkpoints; build judge replay without external payment rights | **G2:** actual external proof or distinct BLOCK, never synthetic success mislabeled |
| **Mon Oct 19** | Finish historical replay/outlier ESCALATE review and destination hard DENY/re-verification, mandatory reason/evidence | Dashboard cards and balances with source/age; implement prepared-action digest and expiry | CI + hosted causal reasons, zero Payouts POST for anomalies |
| **Tue Oct 20 (aspirational G3; if missed, replan)** | Run hosted normal/duplicate/destination with precise source-to-authorization trace; admin and machine scope regression | Continue P1 only if P0 unaffected; finish judge reset and isolated sessions | **G3 P0 acceptance:** safe judge replay twice, past Sandbox proof visible, scoped hosted access; if blocked, STOP new optional integrations |
| **Wed Oct 21** | Stabilize P0, review PayPal execution statuses; rehearse clean-clone/main cutover; migrate/upgrade durable DB with verified restore | AG Grid investigation, complete policy proposal/activation; Assistant explanation | Database available beyond Dec 15; integration QA starts, release branch preparation |
| **Thu Oct 22** | Re-run P0 regression on new DB, source/approval and historic anomaly race checks; complete release rehearsal | Assistant prepared confirmations with stale-state rejection; durable scheduling and time controls; signable chain tests | P1 internal acceptance; freeze notice for authority/schema changes |
| **Fri Oct 23 (freeze gate, not feature-completion waiver)** | **Authority, payment executor, and event/schema contract freeze by noon PT.** Only security repairs after this point. | Scheduling/Bryntum completion; event Merkle checkpoint and Base Sepolia integration; Elastic projection prep | **G4** prepared action/scheduling safety; independent money-diff reviewer begins final review |
| **Sat Oct 24 (only integrated and verified scope)** | Re-run money-path tests on pinned candidate, recover unknown payouts safely | Base Sepolia anchor/verifier/tamper cases; AG polish, Elastic similarity, scoped Zapier initial adapter | **G5** anchored integrity proof, chain receipts and no sensitive on-chain contents; full hosted QA underway |
| **Sun Oct 25 (only pre-cutoff approved fixes)** | No new money/schema features; support blocked provider/integration only if needed | Finish Elastic, Zapier, Postman; Qwen/Jev/Laya measured bounded fixture runs | P2 access/behavior proofs; mock-only integration remains BLOCKED, not DONE |
| **Mon Oct 26** | Re-run three cases and source-to-PayPal integrity after all accepted integrations | Finish model comparative report, sponsor evidence and fallback behavior; zero authority escalation from search/model | **G6** integration candidate complete; two separate full hosted three-case replays begin; no new features |
| **Tue Oct 27 (before noon)** | Fix only blocking faults already found in release rehearsal; obtain independent financial-security diff review and approve exact release tree | Clean install, adversarial suite, migration/restore smoke, full UI accessibility and mobile QA | **G7 security**. Freeze by noon. **G7a:** review PR #2, clear draft and merge to `main` only after gate; release/tag/redeploy parity tests |
| **Wed Oct 28** | Non-mutating final test on tagged/main release; locked judge replay proof and DB monitoring | Public repo after history/secret/license review, README, screenshots, public <3min YouTube video, truthful Devpost | **G8:** clean-clone and Render parity, public judge test twice, accessible video/source links |
| **Thu Oct 29 by 6 PM** | Non-mutating health, auth, provider status and recorded payout receipt checks | Submit Devpost and verify confirmation URL, public links and video; archive evidence packet | **FINISH:** submission confirmed by 6 PM PT; no feature development |
| **Oct 30-31** | Emergency fixes only, every code change reopens necessary security/CI/release checks | Submission outage contingency only | No scheduled development |

**Dates at risk:** If G1 or G2 fails, the dependency chain moves; do not quietly compress testing. If G0 staffing fails, the whole full-scope completion claim remains blocked even though bounded P0 implementation may continue. On October 20/24/26, report the exact incomplete slice list and obtain explicit owner action rather than inventing completion.

## 7. Acceptance and implementation contracts for all thirteen slices

| Slice | Existing baseline | Remaining build and gate | Required proof |
| --- | --- | --- | --- |
| 1. Decision kernel | COMPLETE / merged `main` | Regression only | Deterministic ALLOW/ESCALATE/DENY; no outbound payment |
| 2. PayPal executor | COMPLETE, separate historical Sandbox success | Regression after S3 bridge | One logical payment, stable PayPal IDs, verified item/webhook; no duplicates |
| 3. Invoice + GLM + authority | PARTIAL code and hosted UI | Exact model inference and evidence receipt; T2 T3 T4, source/issuer controls, SHA-bound observation | Real model request + separate bound source-to-authority proof |
| 4. AP history + escalation | PARTIAL import/anomaly/review code | Hosted causal replay/outlier cases, required admin reason, evidence | Real imported history triggers ESCALATE; no Payouts POST |
| 5. Trusted destination | PARTIAL re-verification and controls | Hosted changed receiver DENY; simulated re-verification clearly marked | Destination cannot be trusted by invoice or review action |
| 6. Hosted P0 | Render web LIVE; full integration not accepted | Hosted all three cases + one historical Sandbox proof + judge replay | Gate H and double judge replay passes |
| 7. Dashboard AG Grid | PARTIAL tenant-scoped metrics | Balance attribution/staleness, spend/urgent/upcoming, incidents, AG tables | Human hosted review, tenant isolation, nonfabricated data |
| 8. Assistant and policy lifecycle | PLANNED | Proposal/edit/activate/disable; read-only Assistant; exact prepared-action confirmation | Stale/revoked/chat-only/injection cannot authorize |
| 9. Scheduling/Bryntum | PLANNED | Delayed execution, durable due runner, cancel/review, version revalidation, timeline | Concurrent/restart/cancel tests, no early/duplicate PayPal |
| 10. Hash chain/anchor | PLANNED | Canonical events, Merkle, signatures, Base Sepolia registry, independent verifier | Deliberate tamper -> BROKEN; on-chain receipt verified |
| 11. Elastic | PLANNED | Rebuildable read projection, similarity, failure fallback | Real search/rebuild/outage, no authority from index |
| 12. Zapier MCP + Postman | Agent API exists; adapters planned | Genuine scoped external ingress, public-safe collection and replay | Real provider submission + API-scope negatives |
| 13. Challenger AI | GLM gateway exists; comparisons planned | Qwen/Jev/Laya measured fixtures and monotonic bounded judgments | Actual provider/version evidence; no model clears DENY |

**Cross-slice financial invariants:** Original bytes T0 are untrusted; model T1 never independently becomes T2/T3/T4; trusted origin is independent and appropriately labeled; recipient derives only from the trusted vendor registry; hard DENY cannot become ordinary approval; prepared actions and schedules revalidate current actor, policy, trust and source; no AI or sponsor tool can call privileged payout directly.

## 8. Acceptance matrix: judge, finance, security and external outages

1. **Known vendor under standing mandate:** Verified fictional source and trusted ingress, compliant policy => deterministic ALLOW without new generic human approval. Under `JUDGE_REPLAY`, show ready-to-execute outcome but no external POST.
2. **One authorized Sandbox proof:** Separate exact operator grant => one real Payouts POST, final batch/item and verified webhook; another query/replay never creates another external payment. Receipt prominently says *historical sandbox proof* with timestamp.
3. **Escalation:** Imported historical paid invoice replay, near-duplicate or outlier => causal ESCALATE; required admin reason; no Payouts POST. A separate clean manually approvable escalation tests exact T4, not a hard DENY.
4. **Destination substitution:** Plausible remittance change => hard DENY, vendor re-verification, no payout or trust mutation; even Assistant/admin cannot override without dedicated trust path.
5. **Document and model attacks:** PDF quote mismatch, subtotal/PO confusion, injected instructions in PDF/OCR/CSV/vendor notes/search/tool, model identity mismatch/invalid schema, image self-citations; blocked or escalated without unauthorized trust promotion.
6. **Auth/tenant:** Foreign artifacts, actor SQL injections, admin revocation, agent scope promotion, changed policy or expiry; status 403/404/409 as appropriate, zero cross-tenant data.
7. **Concurrency/PayPal:** Multiple execution requests, unknown outcome, webhook duplicate/out-of-order, stale approval or schedule version; one logical payment and safe reconciliation, no blind second POST.
8. **Storage and audit:** Byte-hash tampering, missing provenance, failed migration/restore, event deletion/truncation/reordering, fake anchor pointer; detect and fail closed.
9. **External service loss:** Experiential optional metadata 401/403/404 synthetic-only fallback with honest unknown, strict-route failure; unentitled model fails; Elastic, Zapier and testnet outages do not clear financial holds.
10. **Judge repeatability:** Fresh judge sessions can run instructions twice without fresh Sandbox payouts or hidden state poisoning; historical proof identity/timestamp remains unchanged.
11. **Deployment:** Clean-clone of tagged `main`, migrations twice, seed twice, exact Render SHA/tree, login, available DB and no secrets; one post-merge smoke on production-like demo config.

All tests must identify whether they are pure mocked unit tests, local signed-in HTTP integration, hosted externally observed behavior, or independently inspected provider receipts. A pass in one class must not be silently promoted to another.

## 9. Mandatory G7a: reviewed release cutover to public default branch

1. **Preconditions:** G3 P0, applicable G4-G6 and independent security approval have evidence; CI green on exact candidate; main unchanged since baseline or rebased and revalidated; GitHub PR #2 source diff reviewed for money/tenant/source/integration boundaries.
2. **Clear draft** only after gate and obtain required reviewer approval. Never merge solely because the schedule says Oct 27.
3. **Merge into `main`** (squash or merge permitted): capture full merge SHA and **Git tree SHA** for the tagged build; if commit SHA changes due to merge, compare compiled source tree equivalence explicitly rather than pretending SHAs match.
4. **Tag immutable release candidate**, e.g. `v0.1.0-hackathon-2026`, on the reviewed `main` commit. No feature changes after tag without a new tag, new security review and CI.
5. **Clean clone default branch and tag:** frozen dependency install, database migrations and seed replay, typecheck, all tests, Next production build and full signed-in HTTP smoke. Verify license, assets, README instructions and absence of secrets in entire exposed history.
6. **Render parity:** Move the development/demo service's deployment source to reviewed `main`/tag or publish a separately pinned identical-tree deployment. Verify live revision is that reviewed release, not `build/slice-3-invoice-intake`; record Render deploy ID, git commit SHA/tree and build evidence. Switching branch can trigger migrations; require DB backup and safe rollback first.
7. **Post-merge hosted acceptance:** two complete three-case judge runs, signed-in access, historical real PayPal receipt, no new payouts, current strict/default privacy checks, webhook/status health, and database continuity.
8. **Only then make the repository public.** If G7a is blocked, publication and Devpost claims stay blocked. A public private-branch link is not an adequate substitute for matching default source.

## 10. Infrastructure continuity, security review and source publishing

- **By Oct 15-17:** Produce verified database export/restore instructions, including original SHA'd synthetic fixtures, encrypted backup location if any, restored login, account/tenant memberships and recorded payout evidence. A seed script is not a substitute for restoring audit history.
- **By Oct 21:** Operator chooses and approves a Render DB plan or replacement that can remain available through **December 15**, verifies cost, migration consistency, ability to recover from a failed migration and monitoring/alerting. Current free DB expires **November 6**; do not defer to November.
- **By Oct 23 noon:** Freeze payment/authority/event schema and adapter contracts. Late critical fixes demand re-running the full security review and affected external tests.
- **By Oct 24-27:** Obtain a separate human or sufficiently independent reviewer for the final financial diff and threat boundaries. Self-review is insufficient as the only release approval for new money-moving behavior.
- **Candidate soak:** Two end-to-end **hosted** three-case journeys on the **same release candidate** plus an independent clean-clone run, no hidden Payouts POST. Include browser/mobile visual checks and strict tenant/session revocation tests.
- **Public-source audit:** Scan tracked files, commit history, generated assets, example env, seed values, media, licenses and README. Keep previously invalidated secrets out of public records; if historical sensitive content remains, resolve source/history exposure before flipping visibility. Do not leak private prompts or tokens.
- **Judging-period availability:** Authenticated demo role, data reset, provider quotas, operator revocation, database and app availability through December 15; documented downtime recovery and read-only fallback.

## 11. Submission packaging and video by October 29

**Demo video target 2 minutes 30 seconds (hard cap less than 3 minutes):**

| Timing | Judge-visible proof |
| --- | --- |
| 0:00-0:15 | Agent needs an independent financial firewall, not permission to call PayPal itself |
| 0:15-0:55 | Distinct, clearly labeled segments: GLM fictional advisory observation that forces ESCALATE; separately sourced deterministic standing-mandate ALLOW and authentic *historical* Sandbox payout, never imply advisory observation authorized it |
| 0:55-1:25 | Real imported AP history catches near-duplicate/outlier, admin declines, no payout |
| 1:25-1:55 | Changed destination triggers hard DENY and dedicated re-verification |
| 1:55-2:15 | Actual investigation, Assistant/policy confirmation and schedule, **only if implemented** |
| 2:15-2:30 | Real tamper-verifier checkpoint and one sponsor integration, **only if independently evidenced**; close on the authorization boundary |

**Public deliverables:**
- Correct `main` source, immutable tag, MIT license, architecture, test setup, readable README with distinction between historic Sandbox proof and non-paying judge replay.
- Live Render app backed by a DB that survives December judging; safe demo login instructions and fictional seed/reset process; prevent judge role payout authority.
- Public YouTube video strictly under three minutes, actual screen evidence and licensed media.
- Devpost write-up with genuine PayPal/AI implementation, sponsor use only where verified, honest current feature status, new-hackathon work, hosted URL, repo/tag/video links and test procedure.
- Submission confirmation URL/receipt archived October 29 no later than **6 PM PT**.
- Evidence index (non-secret): feature -> git tree/commit -> CI run -> Render deploy -> real PayPal/gateway/chain receipts -> human review -> video timestamp.

## 12. Explicit stop rules and change governance

**Plan-level constraint:** A missed latest safe integration cutoff cannot be compensated by compressing financial review or skipping tests. Log an owner decision: add verified capacity, approve an identified deferral, or alter the internal delivery target. Unconfirmed staffing, licensed access, provider serving or a payment grant is always BLOCKED, not a fallback approval.


- **G0-CAPACITY/ACCESS Oct 14:** Unassigned engineers, insufficient confirmed hours, no QA/reviewer slot or unverified sponsor licenses mean **no unconditional commitment to all 13 slices**. Diagnostic code/test work may continue but cannot be labeled scheduled completion.
- **G1 GLM Oct 15:** Provider Free-plan metadata access or model inference error is a visible blocker; only the synthetic route may treat paid-control metadata as optional/unknown, never the strict route. Any provider contractual prohibition blocks inference entirely.
- **G2 Oct 18:** A missed exact approved Sandbox payout does not authorize retesting with fresh recipients/amounts. Preserve zero unintended POST; operator and security gates remain required.
- **G3 Oct 20:** If hosted P0 is incomplete, STOP new P1/P2 mutations that depend on the money path. Request an explicit change in resourcing or approved scope; do not silently waive P0 safety.
- **Oct 23 authority/schema freeze:** New mutations to shared financial contracts blocked; only reviewed high-severity repairs allowed. Re-run dependent tests after any exception.
- **G5 Oct 24 / G6 Oct 26:** Unavailable sponsor capability cannot be labeled complete. Any desired deferral/substitution needs explicit owner approval recorded in the decision log. Never degrade the deterministic authorization boundary.
- **G7/G7a Oct 27:** Missing independent financial review, failed clean clone, PR default-branch mismatch, or hosted parity means BLOCK publication/submission until repaired. Keep a tested rollback, not a fragile last-minute rename.
- **G8 Oct 28:** Missing public repository, public video or judging access means BLOCK readiness, not a conditional success label.
- **FINISH Oct 29:** Only a confirmed published Devpost entry plus verified assets counts as submitted. October 30-31 held only for recovery.

## 13. Required documentation synchronization and revised plan review

**This v3 repair resolves the plan-design findings, not the runtime evidence gaps.** Changes: one October 29 submission contract; critical-path and per-lane slack feasibility; latest safe P1/P2 integration dates; separate GLM/ALLOW demo causality; earlier release rehearsal; independent-review, reset/failure and video dry-run checks. The G0 full-scope gate is still BLOCK until named capacity and entitlements exist.


**Documentation-only repair PR by October 16:**
1. Commit this document as canonical `devpost/october-2026-execution-plan.md`; keep historical v1 outside the repository, clearly superseded.
2. In `devpost/checklist.md`, replace obsolete 'mandatory no-training and capture off' text for synthetic-only demo with the approved optional-control policy; leave default/strict production guards unchanged and keep Slice 3 unchecked.
3. Append an October 14 decision to `devpost/decision-log.md`: October 29 internal finish, G0-CAPACITY conditionality, two-mode judge proof, Free metadata tri-state, release main parity, schema freeze, independent security review, DB continuity.
4. Update the *current status section* of `devpost/build-state.md` (don't rewrite historical checkpoints) to show live `be75fecf`, real Gate H/GLM gaps, exact two-mode policy, and docs-plan pointer.
5. Update README and `devpost/gate-h-live-runbook.md` with judge-replay semantics, default-branch release gate, provider unknown/optional metadata requirement and the difference between simulated T3, normal standing mandate and one-off safety grant.
6. Make all links use the same canonical document and status ledger; record reviewed commit/test, merge only after checks. These are **planned documentation changes**, not claims that the GLM fallback, judge replay, or main merge already exists.

### Re-review gate, before calling this a committed full-scope delivery schedule

**Review independence:** self-review of the revised planning artifact; seek a separate reviewer for release/security evidence.  
**Decision:** `CONTINUE` for bounded diagnostic G0 and document repair only. **BLOCK** an unconditional full P0/P1/P2 commitment until actual named staffing, confirmed capacity and external entitlements satisfy Section 2.2.  
**Critic repairs covered:** H1/H2/H3, M1/M2/M3/M4/M5, L1 by explicit work packages, acceptance checks and dates.  
**Not established:** Actual staffing, API entitlement, provider inference, signed reviewer, app code changes, real invoice-derived payout, main/release parity and published submission.  
**Next gate:** G0 owner/capacity/entitlement evidence, then G1 live synthetic inference. Any source/document commits receive another check for scope drift and truthful implementation status.

## References

- Official rules: https://paypalaihackathon.devpost.com/rules
- Project: https://github.com/redasgard/mandategate
- Existing scope: `devpost/scope.md`, `devpost/prd.md`, `devpost/spec.md`, `devpost/checklist.md`
- Existing Gate H contract: `devpost/gate-h-live-runbook.md`
- Critic report: `MandateGate_October_2026_Critical_Review.md` (October 14, 7.3/10 BLOCK)
- Render demo: https://mandategate-web.onrender.com
- Exact previously inspected development SHA: `be75fecf9cf0bff1deaecabf450888424088a51b`