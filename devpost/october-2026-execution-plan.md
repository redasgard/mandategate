# MandateGate | October 29 Low-Touch Execution Plan (v4)

**Status:** ACTIVE on the development branch after owner-approved PR #21 merge at `f0eb73ff664227b8178b219e7f4cb57291cf6f70` (2026-10-16). This is an execution contract, **not** evidence that the future work or G0–G9 gates have passed.
**Snapshot:** 2026-10-16, 16:17 Pacific time.
**Development baseline:** build/slice-3-invoice-intake at 320531a7e986ea3127a6685e668401d2d5055cab, GitHub Actions 323/323 Vitest tests, Render deploy dep-db97u4m0tbcc73cg7nig LIVE at the same SHA.
**Original scope:** all 13 slices in devpost/checklist.md remain TARGETED; Slices 1-2 checked complete, 3-7 partial, 8-13 not completed. No silent scope cuts.
**Deadline contract:** Submit and retain confirmation URL by THURSDAY OCTOBER 29, 2026, 6:00 PM PACIFIC. October 30-31 emergency-only recovery, NOT planned feature development. **Nothing may be left to November 1.**
**External competition deadline:** November 12, 2026, 12:00 PM Pacific, per official rules rechecked October 16. This later competition date is NOT our development buffer.
**Source of truth:** devpost/scope.md, prd.md, spec.md, checklist.md, decision-log.md, gate-h-live-runbook.md, this plan after review. The unmerged October v3 document in prior PR #3 is planning history and a source of evidence, not a second active execution schedule.
**Tracking:** A task is COMPLETE only with a specific artifact SHA, CI run, externally observed result where necessary, and named acceptance condition. A passed simulation does not establish a paid-provider, payout, issuer, or hosted browser event.

## 1. Outcome, success contract, and stop conditions

### 1.1 Non-negotiable submission outcome

By October 29, 6 PM PT, produce and verify:

1. A publicly accessible MandateGate open-source repository with an MIT license, exact release tree/tag, setup instructions, no exposed secrets/history and correct default-branch contents.
2. A reproducibly working project and a hosted Render judge demo OR independently executable setup instructions; explicitly offer the functional interaction path, not just a static prototype.
3. A public YouTube demonstration strictly under three minutes (target 2:25-2:35) showing actually functioning AI and PayPal behavior. All footage, trademarks and music must comply with the official rules.
4. A submitted, English-language Devpost entry with verified confirmation URL, accurate claims, public source/video/demo links, and truthful user instructions.
5. Demo and data/service availability through the December 1-15 judging period, with at least one verified database restore and a recovery plan.
6. No new unauthorized PayPal payout, no real customer document on the non-ZDR route, and no misrepresentation of an advisory model response as verified payment authority.

**Top priority:** A safe, credible, externally testable submission completed before November 1. Completing all 13 slices remains the owner's approved target, but is not a verified capacity commitment. If verified engineering capacity is insufficient, the owner must approve precise deferrals before feature scope changes. The team cannot reinterpret silence as permission to cut a slice or lower payment safety.

### 1.2 Competition facts verified 2026-10-16

Official: https://paypalaihackathon.devpost.com/rules

The rules require a functional PayPal developer-platform + AI application, public open-source repository, working demo or reproducible run instructions, text description, and public YouTube demo shorter than three minutes. A selected sponsor integration is optional. Judges may test the project through December 15. The official November 12 competition deadline must never replace the owner's pre-November-1 deadline.

### 1.3 Current code and evidence baseline

- **S01 decision kernel:** DONE, main and active development; organization-bound agent intake, deterministic ALLOW/ESCALATE/DENY.
- **S02 PayPal executor:** DONE, one independently evidenced HISTORICAL direct Canonical Sandbox payout, item and verified webhook/reconciliation proof from an earlier Render environment. The CURRENT connected Neon org_demo database has ZERO payment-execution records; the earlier payout is not invoice-derived or current Neon evidence.
- **S03 source/AI:** PARTIAL. Authenticated PDF/PNG/JPEG storage and reviewer, parsed PDF T2 support in CI, scanned-PDF raster/image observation, actual persisted fictional GLM T1 observations, SHA allowlist, explicit consent and strict route. Current three T1 observations are ESCALATE, never issuer or payout authority.
- **Strict Experiential route:** BLOCKED. Hosted account preflight returned EXPERIENTIAL_ACCOUNT_ZDR_REQUIRED. Owner reports full account-level ZDR is Pro-only (provider pricing not independently verified). Strict route and existing Gate H runner remain fail closed. No Pro purchase required for fictional-only hackathon demonstration.
- **S04-S07:** PARTIAL code, not checked in the canonical list: AP-history anomalies, recipient mismatch handling, hosted preview/judge cases, basic dashboard.
- **S08-S13:** NOT accepted and described as planned in the canonical 13-slice checklist. Do not reclassify due to draft docs or aspirational roadmap.
- **Current hosted:** Render mandategate-web, service srv-db39vmm7bikc73c55nh0, on development branch build/slice-3-invoice-intake at exact SHA 320531a7. PR #2 is draft into main; main is NOT yet equivalent to the hosted development build.
- **PR #3:** Old draft October v3 plan branch has a stale/merge-conflicted base and contains historical gate reports. Preserve it as evidence, but do not merge its old state directly into current development.

### 1.4 Hard safety and truth constraints

- GLM/image/extracted PDF source text is untrusted T1. It cannot invent an independent T2 field, a genuine T3 issuer, or a T4 payment grant.
- A byte-exact allowlisted FICTIONAL invoice may pass the separate consented non-ZDR demo route. It is always advisory ESCALATE. It does NOT pass strict privacy or invoice-to-PayPal Gate H.
- A deterministic known-vendor ALLOW is permitted under a previously authorized standing mandate only after true trusted source/recipient/policy checks, never because the LLM says ALLOW.
- Never auto-send PayPal on behalf of judges, CI, admin demos or a scheduled task. One new USD 1.01 Sandbox transaction, IF justified, requires a fresh, precise operator grant AFTER a green no-network preflight. That grant is distinct from a PR-merge approval.
- The historical PayPal proof may be shown as a separate previously recorded rail example. No screen/video may claim that a synthetic GLM invoice caused it, or that it is stored in today's Neon dataset.
- Block hard-DENY destination substitutions, expired/revoked admin/session/agent scopes, foreign-organization source records, duplicate payouts, bad signatures, interrupted webhook outcomes and stale/replayed approvals.
- No paid subscription, vendor account upgrade, recurring infrastructure spend, public repository publication or final Devpost submission is presumed authorized by this plan.

## 2. Minimal-human-interaction operating protocol

### 2.1 Real execution mechanism and limits

One accountable integrator coordinates a bounded execution queue using connected GitHub, Render, Neon and available local/CI tooling. A plan or ChatGPT conversation DOES NOT itself spawn a persistent background engineering team, keep work running between chats, or supply independent reviewers. Work continues during explicit active sessions or through separately configured GitHub Actions/approved scheduling or an eligible persistent Work/Dots workflow. Do not claim background execution exists unless a functioning task, agent and delivery mechanism are verified.

Preferred workflow for each bounded task:
1. Inspect latest branch SHA, source files, existing issue, test and environment.
2. Make a short feature branch from the latest correct integration SHA; never directly change main.
3. Write the smallest code/test/docs patch with a named acceptance test.
4. Run frozen dependency install, migration and seed replay when affected, TypeScript, Vitest, production build and signed-in HTTP smoke in GitHub Actions. Add relevant hosted/external read-only proof.
5. Conduct critical review of the patch; repair failures; record provenance and limitations.
6. Open a concise PR with SHA, risk class, CI links, visible result, rollback and required approval level.
7. Group integration/deployment merges into at most two owner-visible waves, if the owner authorizes those exact merges. Existing Render auto-deploys the development branch after checks: do not silently merge an unapproved PR into it.
8. Update the authoritative checklist only when slice-level acceptance is proven; do not check a partial slice based on code existence.

Parallel lanes are **work assignments**, not proof that separate developers or agents have been allocated. If only one implementer/runtime is truly available, work is serial on the highest dependency path and release scope cannot be represented as guaranteed.

### 2.2 Permission boundaries and escalation

| Class | Default operation without interruption | What must stop for human authorization |
| --- | --- | --- |
| R0 read-only | Inspect GitHub/CI, Render statuses and Neon read-only data; review official rules; create non-sensitive analysis | Access needing another workspace/account or disclosure of secrets |
| R1 reversible planning/build | Draft isolated branches, documentation, tests, local synthetic fixtures, PRs and self-review; no app deployment | Merging into an auto-deploy branch, live migration, shared persistent records or public visibility |
| R2 integrated non-financial code | Prepare batch integration and tested rollback, optionally request one consolidated release approval | Shared deployment/change to auth, tenant access, AI routing or protected authority contracts |
| R3 financial/external irreversible | Non-mutating preflight and read-only reconciliation only | Exact PayPal Sandbox payout, cost/plan activation, new third-party credentials, provider processing of unapproved material |
| R4 publication | Prepare README, draft Devpost description, video script, evidence index and media | Publish repository/video, grant judge access, submit Devpost, or assert official entrant agreement |

The user can later grant a narrow standing authorization for safe R2 deployment merges, but **this planning request is not such a grant**. Merge and payment grants may never be conflated.

### 2.3 Bundle interactions into fixed checkpoints

| Packet | Target | User action, max expected active time if ready | Default if no response |
| --- | --- | --- | --- |
| H0 project access/capacity | Oct 16-17 | One concise reply: confirm source-publication ownership and Devpost/YouTube account access; named engineering/reviewer availability; max spending budget; whether a batch non-financial deployment authority is granted | Continue R0/R1 only; no spending, PR merge or public publish |
| H1 optional single Sandbox payout | Oct 18 or later, ONLY after G2 dry run PASS | Approve exact USD 1.01 Sandbox payout: named fictional invoice + SHA, verified recipient, logical payment ID, single POST, expiration, no retry with new ID | Skip new payout and present historical Sandbox rail evidence truthfully |
| H2 scope/capacity exception | Oct 20 only if full thirteen-slice path lacks verified resources/slack | Choose named extra engineering/reviewer capacity OR explicitly authorize an enumerated deferral/replacement for the Oct 29 release | Leave all 13 targeted; do not label unimplemented work complete; do not make unsafe last-minute changes |
| H3 final security and publication | Oct 26-28 | Approve exact reviewed release commit/tree/tag, confirmed infrastructure cost/availability, repo visibility and public video/account permissions; independently obtained financial-diff signoff | Do not merge unreviewed money changes, publish secrets, pay for services or switch live branch |
| H4 final submission | Oct 28-29 | Preview the final Devpost form, authorized representative and URLs; user performs final submission if no connected submission capability and returns confirmation URL | Submission NOT claimed, escalation before Oct 29 deadline |

Target interaction pattern: a compact written status only on a gate that needs a decision, not one request per test/commit; one consolidated packet lists exact choices and a recommended safe default. This low-touch budget assumes the owner separately grants the narrow R2 batch-merge authority in H0; otherwise each auto-deploy merge still needs an explicit approval and human interactions increase. Execution must remain truthful if there is no response.

### 2.4 Daily status and automatic incident routing

Post one small status record per working day to the PR/issue ledger, not a chat flood. Fields: UTC/PT timestamp, source SHA, hosted Render SHA, CI run, completed slice ACs, blocked ACs, deadline slack, scope risk, next task, action required and owner deadline. The report can be delivered automatically only if a working scheduled GitHub/automation mechanism is configured. Never imply a scheduled alert is live before creating and testing it.

Stop immediately and escalate once, with exact evidence, on: unauthorized potential money action, real customer data in non-ZDR route, credential disclosure, failed source isolation, inability to restore data, unknown PayPal payout outcome, failed security gate, or publication rights uncertainty. Retry isolated CI transient failures at most twice; three materially similar failures require a different approach.

## 3. Capacity gate and honest feasibility

The previous October v3 planning estimate was 27-40 focused engineering/release days before a 20% reserve. Current remaining code has since advanced (several PRs merged on October 16) but no measured replacement forecast has established enough parallel capacity. A 13-calendar-day window does NOT mean 13 parallel engineering days are available for every lane.

G0-CAPACITY cannot pass without:
- an actual responsible implementer per parallel lane, exact hours and absence of conflicting work;
- a separately scheduled QA/release and independent money/security reviewer;
- tested entitlements for selected sponsors and no unapproved paid vendor costs;
- a measured dependency-critical-path estimate plus at least 20% per-lane integration/rework reserve, and enough calendar time before the October 23 contract freeze and October 27 release cut.

### Two feasible planning modes

**Mode A, all thirteen slices by October 29:** CONDITIONAL and currently UNVERIFIED. Requires demonstrated independent work lanes A/B/C/D, QA/release coverage, applicable paid/service permissions and independent security reviewer. Parallelism is allowed only on disjoint state and frozen interfaces. No project manager should claim Mode A PASS merely because four role names appear in a document.

**Mode B, deadline-protected working submission:** This is a PROPOSED contingency, **not pre-approved removal of P1/P2**. First finish demonstrable P0, safely replay judges' three cases, publish existing separately evidenced PayPal and AI paths, and package a truthful submission. Each P1/P2 slice must still be attempted/verified if capacity exists. At H2, owner must explicitly enumerate deferred items and their effects if Mode A proves unattainable. The default without H2 is to keep preparing truthful assets while leaving official scope changes unresolved, never silently check boxes or weaken security. A release candidate may include only previously verified S02 financial functionality if a late new authorization change is not independently reviewable; the owner must authorize the named omission and claims.

## 4. Task dependency DAG and gates

Main critical path:
G0 staff/access -> G1 fictional GLM/T1 evidence and safe original file -> independent parser T2 -> correctly classified controlled/independent T3 origin -> T4 exact policy+receiver+approval -> hostile-input/tenant/race preflight G2 -> optionally owner-authorized one-shot Sandbox POST -> webhook/reconciliation -> three hosted P0 cases G3 -> safe judge replay twice -> security G7 -> main/tag/Render parity G7a -> public assets G8 -> submitted Devpost G9.

Independent-but-limited parallel work:
- **Lane A, P0 money and trust:** S03-S06, authority/issuer, hostile invoice tests, exact payout proof. Owns shared payment/authority code.
- **Lane B, product/admin:** S07-S09, read-only metrics, Assistant policy proposal and timetable UI. May not mutate Lane A's authority contracts without integration review.
- **Lane C, integrity/operations:** S10, append-only audit and Base Sepolia optional anchor, Neon backup/restore and judge availability. Owns data recovery; release migrations coordinate with Lane A.
- **Lane D, bounded sponsors/evaluation:** S11-S13, Elastic read projection, Zapier/Postman scoped client, Qwen/Jev/Laya test matrix. Cannot create financial authority or bypass source checks.
- **Lane Q, verification/release:** CI, deterministic judge fixtures, screenshot/visual evidence, clean clone, public assets, video, independent review coordination.

Gate outcomes must be PASS/BLOCK/UNVERIFIED with a directly inspectable evidence link. The gates have a specific stop behavior; they are not ceremonial boxes.

| Gate | Planned exit | Concrete PASS artifact | If BLOCK |
| --- | --- | --- | --- |
| G0 CAPACITY/ACCESS | Oct 17 | Actual resource/entitlement ledger, accepted labor forecast and one accountable integrator | Do not promise thirteen slices; continue safe P0 and seek H2 decision |
| G1 T1/IMAGE | Oct 17 | SHA/consent-bound GLM saved T1 ESCALATE, source/model/request receipt and strict ZDR refusal evidence | No new AI claim or real document transmission |
| G2 PREFLIGHT | Oct 18 | Independently parsed T2, honest T3 category, frozen T4 tuple, one positive/two hostile negative decisions, zero outbound PayPal POST in dry run | No new Sandbox payout; use historical rail evidence with caveat |
| G3 P0/JUDGE | Oct 20-22 | Signed-in hosted ALLOW-ready, history ESCALATE/decline, substitution DENY, two isolated zero-payment replays, exact SHA and screenshots | Stop dependent P1/P2 mutations; H2 formal capacity/scope decision |
| G4 ACTION FREEZE | Oct 23 noon | Stable money, approval, schedule and event/schema contracts; reviewer identified | No late consequential feature merge |
| G5 TRUST/INTEGRATIONS | Oct 24-25 | Only real licensed sponsor integrations or verified opt-outs; no new payment authority | Mark unavailable as BLOCKED; request named deferral |
| G6 QA CANDIDATE | Oct 26 | Pinned candidate, all applicable CI, adversarial suite, restore, outage/race tests, two browser replays | Block release cutover until repaired |
| G7 SECURITY | Oct 27 | Independent review for consequential money/auth diff, no open critical/high, clean secret/history/IP audit | No publication or unsafe financial changes |
| G7a MAIN RELEASE | Oct 27-28 | PR #2 review/merge to main, tag/tree, clean-clone build and Render exact-tree parity; rollback | Stay private and do not label release ready |
| G8 PUBLIC ASSETS | Oct 28 | Public repo/license, video <3 minutes on YouTube, English docs, accessible judge demo through Dec 15 | No Devpost completion claim |
| G9 SUBMIT | Oct 29 by 18:00 PT | Published Devpost entry and confirmation URL; every link independently opened | Emergency-only contingency Oct 30-31, NEVER November |

## 5. Work packets: all thirteen slices

These are acceptance contracts, not declarations that already-working mock tests are production proof.

| ID / lane | Existing state | Required next work | Automated checks and independent evidence | Target / dependency |
| --- | --- | --- | --- | --- |
| S01 / A | COMPLETE | Freeze direct decision invariants, confirm future changes do not bypass scoped agent or policy | Signed-in ALLOW/ESCALATE/DENY, anti-escalation, cross-tenant CI; preserve exact original SHA/policy version | Regression daily / all |
| S02 / A | COMPLETE historically | Recover immutable prior Sandbox proof and mark it as historical; no blind second payment; ensure webhook dedupe and idempotency | Prior Render/Payouts IDs matched read-only; logical ID unchanged; zero new payouts from CI | Oct 17 / before demo |
| S03 / A | PARTIAL | Finish issuer-independent T2 source confirmation, controlled fictional-origin versus genuine T3 distinction, T4 exact binding and full source-to-authority negative cases; persist honest optional provider policy receipt if required for demo evidence | PDF text vs scanned-PDF refusal, SHA matches, reviewer admin, stored fictional GLM T1 ESCALATE, privacy strict refusal, exact binding, authorized test fixture vs model-only rejection | Oct 17-20 / G1 |
| S04 / A | PARTIAL | Replay a historical paid invoice as near-duplicate/amount outlier; require mandatory reason and optional file reference in review | Real seeded imported history causes causal ESCALATE; reason preserved; zero payment execution | Oct 19 / S03 |
| S05 / A | PARTIAL | Invoice demands different receiver; DENY with explicit re-verification state; admin cannot silently accept changed banking | Trust registry untouched, forced DENY under forged invoice/agent and stale policy; signed-in browser proof | Oct 19-20 / S03 |
| S06 / A+Q | PARTIAL hosted | Join S03-S05 into one actual Render judge experience; read-only AI evidence visible; safe repeatable ALLOW-ready, ESCALATE, DENY; no payment on judge replay | 2 independent signed-in hosted sessions with screenshots, precise reason codes, payout POST count zero, historical proof labeled separately | Oct 20-22 / G3 |
| S07 / B | PARTIAL | Dashboard actionable incident cards, spend/balance source/time, urgent/upcoming/overdue, AG Grid only if licensed/verified; no fabricated financial balance | Tenant isolation and stale/source labels; signed-in mobile+desktop visual QA; actual grid render if claimed | Oct 22 / G3 contract |
| S08 / B | PLANNED | Proposal/edit/activate policies; Assistant only reads authorized facts or prepares exact digest/expiry/actor action for explicit confirmation | Changed state, stale digest, revoked actor, prompt injection, impersonated tool results all refuse unauthorized write/payment | Oct 23 noon / S03 contracts |
| S09 / B+A | PLANNED | Scheduling and Bryntum timeline if entitlement; durable due runner, cancellation, current policy/trust recheck at execution time | Concurrent/restart/cancel race, no early or duplicate Sandbox POST, hard DENY not schedulable, signed-in timeline | Oct 23 noon / S08+S03 |
| S10 / C | PLANNED | Canonical events -> append-only Merkle digest -> independently verified checkpoints; Base Sepolia only if real testnet receipt and wallet/fees authorized | Tamper/truncation/reorder test produces BROKEN; evidence receipt sourced independently; no secrets/raw invoice text on chain | Oct 24 / stable events |
| S11 / D | PLANNED | Elastic projection/search/similarity with rebuild/outage semantics; PostgreSQL always authoritative | Real connection, index rebuild, tenant-scoped query, failure fallback and zero changed approvals | Oct 24-25 / S04 data |
| S12 / D | PLANNED | Zapier MCP external scope-limited request and public-safe Postman runnable collection | Genuine provider request, 403 on actor elevation, no payment scope, no credentials in public collection | Oct 24-25 / agent API |
| S13 / D | PLANNED | Qwen/Jev/Laya bounded adverse fixture matrix; compare exact model/version/latency/behavior; forbid challenger from clearing hard DENY | Actual provider receipts/entitlements or mark unverified; adversarial/malformed/retargeting cases; monotonic risk | Oct 24-25 / G5 |

### Acceptance test taxonomy

Every work packet labels each assertion: UNIT-MOCK (fixture only), CI-INTEGRATION (database/local authenticated app), HOSTED (observed live UI/API), EXTERNAL (PayPal/GLM/chain signed or provider-reported receipt), and INDEPENDENT (separate reviewer/provenance). A model or producer assertion cannot become an independently verified fact just because a unit test is green.

Minimum shared hostile coverage: foreign tenant and revoked admin; unscoped or tampered agent token; PDF prompt injection/self-cited image quote; amount, PO vs invoice, line totals; historical replay; receiver substitution; stale approval digest; concurrent duplicate submit; webhook signature, duplicate/out-of-order/unknown outcome; corrupted audit checkpoint and backup restore; model unavailable, sponsored services offline. Automated tests never invoke a new PayPal POST in normal CI.

## 6. Daily execution sequence (conditional exit targets)

A day is marked passed only after its exit evidence exists. Dates can be missed; never use the calendar to bypass a gate.

| Date PT | Lane A, money/source and judge case | Parallel B/C/D only with verified capacity | Lane Q, proofs/release, human interaction |
| --- | --- | --- | --- |
| Fri Oct 16 | Freeze current stable SHA; inventory T2/T3/T4 holes; read-only reconciliation of current Neon and historical PayPal facts | Verify sponsor/license access, identify actual UI/DB owner; inspect database continuity (Render older free expiry vs current Neon) | Create v4 plan/review PR, G0 ledger; H0 single approval/availability packet if necessary |
| Sat Oct 17 | Build/check T2 field evidence and correctly labeled controlled T3 issuer; T4 source-to-tuple negative tests, no payment | B starts dashboard source/staleness labels; C tests isolated backup/restore; D gathers real provider capabilities | G1 source/privacy model evidence, deterministic static adversarial fixtures, freeze exact one-shot proof contract |
| Sun Oct 18 | G2 zero-network preflight; if strictly complete, request H1 for exact USD 1.01 Sandbox test and independently reconcile; else skip without retry | B prepares AP review/receiver UX; C audit append-only verification in local tests | One concise G2 status, zero unapproved Payouts POST, ensure historical evidence scenes truthful |
| Mon Oct 19 | End-to-end seeded AP replay/outlier ESCALATE, mandatory review reason, receiver substitution hard DENY | B dashboard incident and policy proposal scaffold; C restore run; D can work with recorded fixture harness | Signed-in integration test, negative money/event counts, capture first 2:30 script storyboard |
| Tue Oct 20 | G3 initial hosted normal ALLOW-ready, duplicate ESCALATE, retargeted DENY; determine whether invoice-derived PayPal proof is honestly present | B/C/D independently report actual remaining work/entitlements | **H2 exception only if needed:** all-13 capacity shortfall, enumerate deferrals or funded added lanes. Do not interpret absence of response as approval |
| Wed Oct 21 | Safe judge replay mode and two different session identities, zero new payouts | B read-only dashboard; C backup/restore, DB survival through Dec 15; D sponsor readiness | EARLY release rehearsal: PR #2 vs main, clean checkout, license/secrets review, video dry-run 1 |
| Thu Oct 22 | Re-run hostile P0 browser flows on selected durable DB; stabilize source/authority | B finish UI/AG and prepared-action tests if accepted; C independent event hash tests | G3 full hosted/visual acceptance, DB recovery receipts; reserve remaining security margin |
| Fri Oct 23 | **NOON: shared money/auth/schedule/event contract freeze.** No new financial feature after freeze | B only code already safely integrated; C Merkle/checkpoint; D non-authorizing sponsor adapters | G4 signed freeze inventory, independent security reviewer starts financial diff |
| Sat Oct 24 | Replay protected financial regression and outage recovery, no new money actions | C actual Base Sepolia receipt if licensed/test funded; D Elastic/rebuild and Postman; B polish only | G5 feature-by-feature proof, cap spend and external calls; rejected integrations stay behind flags |
| Sun Oct 25 | Stabilize exact release candidate and negative payout cases | D real Zapier/MCP provider proof and model comparisons if usable; no new shared payment contract changes | Final feature admission: green+usable or explicitly unresolved (H2 scope approval required for changes) |
| Mon Oct 26 | Pin release candidate; no unrelated new features | C confirm DB continuity/restore, B/D regression and documentation | G6 two full hosted three-case replays, screenshot/accessibility/desktop-mobile QA, cold install, attack matrix |
| Tue Oct 27 | Fix blocking faults only with independent financial review; no unsafe fast merges | B/C/D close their evidence and expose truthful only verified UI | G7/G7a: reviewer signs off money/auth delta, PR #2 to main only after reviewed approval, immutable release tag/tree and Rollback |
| Wed Oct 28 | Verify no unintended Sandbox payout, webhook/status read-only | No new features; service remains stable through judging | G8: public-safe repo/license/history, main-vs-Render exact tree, public YouTube <3 min, complete English README/Devpost draft and judge test twice |
| Thu Oct 29 | Read-only health/status; no code churn unless stopping blocker | No feature development | By 16:00 PT preflight: assets/URLs/credentials; H4 final Devpost action. **By 18:00 PT confirmation URL archived.** |
| Oct 30-31 | Only outages, security or submission defects | No planned features | Emergency corrective deployment/re-submit within OWNER before-November-1 deadline; every change reopens impacted security gate |

The dates for S08-S13 are optimistic **latest safe integration cutoffs**, not evidence of available engineers. If staffing is serial or an external entitlement is missing, G0/G3 may block all-thirteen-slice release. Never automatically trade away security or judge availability to retain an optional sponsor badge.

## 7. Exact command-level verification and evidence pipeline

The active package.json offers the following reproducible scripts:
- corepack prepares pnpm 12.9.1; pnpm install --frozen-lockfile
- pnpm db:migrate and pnpm demo:seed, both repeated to prove idempotence in isolated CI test storage
- pnpm typecheck
- pnpm test (Node runtime-profile checks plus Vitest)
- pnpm build
- pnpm smoke (authenticated Next HTTP, organization isolation, synthetic source/reviewer, safe history and declined/destination cases)
- pnpm verify:vision:privacy is metadata-only strict preflight; cannot substitute a full account ZDR receipt
- pnpm gate-h:sandbox is the guarded **potentially money-moving** acceptance runner: NEVER invoke it without its own complete authority preflight and specific owner payment grant.

Required GitHub Actions jobs and/or test artifacts:
1. PR and integration branch checks run only against ephemeral/local test DB and synthetic data; no PayPal payout credentials available in ordinary CI.
2. Unit, database, TypeScript, build and signed-in HTTP tests must all pass on the exact PR SHA.
3. Freeze a sanitized evidence manifest per accepted slice: source SHA, test run, artifact/fixture SHA, authority outcome, external proof if any, owner/reviewer, caveats.
4. For deployment gates, independently poll Render until status LIVE and commit/tree matches reviewed code; a green GitHub job alone does not equal a live deployment.
5. For hosted acceptance, use a signed-in browser or approved Work/cloud computer, capture actual screenshots/URL/revision, confirm ALLOW-ready vs ESCALATE vs DENY and truthful AI/Sandbox separation. Component SSR strings alone do not prove visual usability.
6. For sensitive changes, independent security review must verify the patch and current trust chain, not just accept the implementer's self-score.
7. At 09:00 and 17:00 PT on active workdays, **when a scheduler has actually been installed**, produce a concise ledger with remaining critical path and red gates. A planned cron alone is not an active automation.

Stop/rollback policy: CI failure -> repair branch; unknown production mutation -> stop; failed migration -> restore from checked backup; Render failure -> revert to last known live reviewed SHA; any unknown PayPal payout status -> read-side reconcile, never blind resend. Record every rollback in decision-log.md and the release evidence index.

## 8. Judge demo and three-minute video script

Target a video of 2:30, built from real screen captures, with a visible trust boundary rather than 2:30 of architecture jargon.

| Video segment | Planned length | Required visible proof |
| --- | --- | --- |
| Problem: operators and agents should not control their own payouts | 0:00-0:15 | Hosted product plus decision boundary |
| Fictional GLM PDF/image observation | 0:15-0:45 | Stored SHA-bound source, served GLM candidate and ESCALATE; label non-ZDR synthetic consent |
| Normal trusted-policy ALLOW and distinct PayPal rail | 0:45-1:10 | Fresh deterministic ALLOW-ready, and separately labeled HISTORICAL real PayPal Sandbox proof (or newly approved proven invoice-derived proof if it actually exists); do not claim causal linkage otherwise |
| Abnormal AP history / duplicate | 1:10-1:40 | Imported history, reasoned ESCALATE and admin decline with reason, zero payout |
| Receiver substitution | 1:40-2:05 | Hard DENY and trusted-channel re-verification; no ordinary override |
| Audit and meaningful verified extra(s) | 2:05-2:25 | Audit/tenant protections, Assistant or Merkle only if actually implemented, not concept slides |
| Final payoff and test instructions | 2:25-2:35 | Why this reduces autonomous AP risk, repo/hosted URL |

Shoot the first rough capture no later than October 21 to detect confusing click paths. Freeze final script after exact receipt review. Avoid an overstated automatic "invoice-to-payment" claim when current verified T1 only escalates.

Public deliverables: tagged main, clean README and setup command, license, judge-usable role that has ZERO PayPal payout capability, deterministic fixture/reset procedure, source/feature matrix, authentic screenshot/video (no unlicensed media), English Devpost text and evidence links. Verify published YouTube video URL, privacy, duration and playback from another session. Final publication and submission require an authorized entrant.

## 9. Final release cutover checklist (G7a-G9)

- [ ] Exact candidate commit and tree SHA frozen; code affecting money/tenant/auth independently reviewed; latest G6 QA passed.
- [ ] Backup+restore test of actual target persistence completed before migration or branch switch; scheduled persistence remains valid through December 15.
- [ ] PR #2 source diff reviewed against main and no secrets/lost migrations; merge only with appropriate explicit approval. If the large draft cannot pass review, assemble a narrower release candidate from main plus specifically verified changes, with an explicit owner-approved scope ledger; never merge the entire WIP solely to match Render.
- [ ] Immutable release tag created on reviewed main commit, clean checkout, frozen install, migrations/seed twice, test, typecheck, build, signed-in smoke.
- [ ] Render production/demo uses reviewed tree (same SHA or independently verified equal tree), status LIVE, health/auth and three-case judge replay observed.
- [ ] No normal judge action causes an outbound Payouts request; historical payout separately labeled with original identifiers and date.
- [ ] Public GitHub repository, MIT license visible, main contains complete declared build, clean history/source/media and no secrets.
- [ ] Hosted judge account or setup instructions valid without payable credentials, tested in two isolated sessions and supported until Dec 15.
- [ ] Public YouTube link plays, video 2:25-2:35 target and strictly under 3:00, footage shows real app operation.
- [ ] English Devpost draft truth checked line by line against verified implementations, including GLM free-tier caveat and historical Payouts distinction.
- [ ] Authorized owner submits Devpost and captures the actual entry/confirmation URL by October 29 18:00 PT.
- [ ] External judging uptime/watch and rollback instructions recorded; H4 has confirmation, not merely a saved draft.

## 10. Failure, fallback and explicit owner decisions

**R1: Full ZDR unavailable on Free Experiential.** Expected, already observed. Continue consented fictional-only T1 demo, strict route BLOCKED; do not pay for Pro or substitute synthetic ZDR metadata. Any new provider route needs licensing/privacy review.

**R2: No invoice-derived verified PayPal proof by G2.** Do not trigger risky payout. Demo separate legitimate pieces: saved GLM ESCALATE and an independently recorded historical direct Sandbox payout, labeled as separate transactions. This is weaker end-to-end proof and must be disclosed. If a new proof is important, prepare exact source/issuer/approval tuple and present H1, never assume prior permission.

**R3: G0 staffing insufficient for all 13.** Request H2 with an exact list and measured slippage; choices are verified extra lanes or a formally approved, named deferral. Continue deadline-protecting core work in reversible branches. The absence of an owner reply never means silent scope reduction.

**R4: Owner cannot supply final public Devpost/YouTube browser access.** Complete and review scripts, metadata, source and video files; prepare a single explicit final action packet with URLs, field values and reproducible instructions. Cannot declare submitted until platform confirms it.

**R5: Render DB from the October 14 plan reported November 6 expiry.** Do not assume today's Neon-backed app uses that Render database without fresh connection verification. Identify the actual active persistence, export and restore it, check plan/retention/cost and judging availability; migrate only after approval and backup proof.

**R6: PR #3 October v3 is stale and has merge conflicts.** This v4 is reconstructed from latest live commit and old v3 as evidence, without pulling contradictory/stale gate statuses into deployed truth. After this PR is accepted, mark PR #3 superseded or individually recover useful historical review documents; do not merge both canonical plan files.

**R7: Prohibited/unauthorized sponsor integration, testnet spend or missing independent review.** Do not fabricate provider receipts, charge accounts or replace review with self-review. Keep in an isolated branch; escalate the named gate. If independent review of a new money/auth change cannot be obtained, remove that change from the candidate and revert to the already verified S02 financial trust boundary, then rerun integration/hosted tests; do not claim the excluded invoice-derived feature. If the resulting smaller release is still functional, owner must explicitly approve its named scope deferral and exact release tree. If reverting cannot preserve safety, G7 remains BLOCKED.

## 11. Next executable actions, ordered

1. Confirm the v4 planning PR is from live SHA 320531a7 and read the exact CI/checklist/Gate H sources. No deployment.
2. Post a compact H0 packet requesting only the approvals/blockers that actually need the owner; bundle capacity, account/publishing access, cost cap and optional limited merge authority. Avoid a question about information already known.
3. Begin read-only critical path assessment of S03 T2/T3/T4 and current demo evidence. Create a tiny branch implementing the highest-leverage testable source-authority repair. Do not spend money or run payouts.
4. Build G2 no-network tests and one real positive/two adverse fixtures. If missing issuer or strict GLM proof, leave Gate H marked BLOCKED, but keep the fictional demo demonstrable.
5. Prepare a signed-in hosted screenshot and safe judge replay rehearsal; fix confusing visual flows before optional integrations.
6. Before October 20 H2, produce measured ticket burn-down and capacity arithmetic. Ask for a scope/capacity decision only if essential, presenting exact implications for judge proof.
7. Prepare early database recovery and source-publication rehearsal. Keep main and Render SHA parity for final release, not just an impressive development branch.
8. Freeze money contracts on October 23, admit only tested optional features by October 25, finalize two full hosted runs and security review on October 26-27.
9. Publish code/video and submit Devpost by October 29, 18:00 PT. November is not a working option.

## 12. Evidence/index and review protocol

Each daily checkpoint or PR must preserve:
- source_commit and source_tree (if released);
- intended task ID + affected docs/spec and acceptance criterion;
- claim state (OBSERVED / VERIFIED / SUPPORTED / UNKNOWN / BLOCKED);
- CI run and scoped test class (unit, local integration, hosted, actual external);
- Render service/deploy SHA if changed;
- provider privacy/PayPal webhook/chain receipt identifiers, if independently inspected, never secrets;
- exact financial side effect count (normally zero);
- risk and rollback plan;
- self-review labeled as such, independent reviewer only if actual review occurred;
- next gate and owner intervention required (usually NONE).

**Critique requirement:** Standard weighted review for the plan, then further bounded reviews for every consequential stage, and an independent financial/auth review before G7 release. A high score on an untested plan does not authorize execution. Do not report a plan-only checklist item as DONE.

### Cross-source links

- Live code: https://github.com/redasgard/mandategate/tree/build/slice-3-invoice-intake
- Slice checklist: devpost/checklist.md
- Core scope: devpost/scope.md
- Architecture: devpost/spec.md
- PRD: devpost/prd.md
- Decision history: devpost/decision-log.md
- Strict/synthetic Gate H: devpost/gate-h-live-runbook.md
- Historic v3 planning evidence: PR #3 (draft/conflicted, October 14)
- Slice 3 release integration: PR #2 (draft into main)
- Official hackathon rules: https://paypalaihackathon.devpost.com/rules
