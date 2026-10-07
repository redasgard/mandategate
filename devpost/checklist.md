---
doc: checklist
status: draft
---

# Build Checklist

Build mode: [learn or fast — choose after build-order approval]

## Slices

- [ ] **1. A seeded invoice request reaches the MandateGate decision kernel**
  Becomes usable: A local MandateGate app starts, a seeded demo admin can sign in, a scoped operations-agent principal can submit a synthetic canonical invoice request, and the UI/API shows an ALLOW, ESCALATE, or DENY decision without moving money.
  Why now: This proves the unique kernel first: the agent can request, but deterministic MandateGate policy and vendor state own financial authority. Project bootstrapping, database/auth setup, seed data, the first dashboard, and baseline tests live inside this usable slice rather than becoming separate plumbing tasks.
  PRD ref: `prd.md > The Core Journey`, `prd.md > AI Security, Authority, and Traceability`, `prd.md > What We're Building > P0 — release blockers`
  Spec ref: `spec.md > How This Works, In Plain Language`, `spec.md > Authentication`, `spec.md > Agent API`, `spec.md > Policy and Decision Engine`, `spec.md > Data Model`, `spec.md > File Structure`, `spec.md > Look and Feel`
  Build: Scaffold the pinned Next.js/TypeScript/pnpm project, Drizzle/PostgreSQL schema/migrations, Better Auth demo-admin flow, scoped machine principal, demo seed command, minimal agent submission endpoint, deterministic policy/decision kernel, structured reason codes/evidence, and a first dashboard/detail surface that renders the result. Add baseline mechanical test scripts and keep synthetic fixture data explicitly labeled.
  Verify (mechanical): Run the migration and idempotent demo seed, typecheck/build the app, run the core decision tests, start the server, verify `/api/health`, and submit fixtures that deterministically produce ALLOW, ESCALATE, and DENY without any PayPal call.
  Learner check: Sign in locally, submit or trigger the three seeded requests, and confirm the control surface makes it obvious that the agent requested payment but MandateGate made the decision.
  Commit: `build decision kernel`

- [ ] **2. An allowed request can execute exactly one real PayPal Sandbox payout**
  Becomes usable: The normal seeded request crosses the real payment boundary, creates a one-item PayPal Sandbox payout, persists its remote identifiers/state, and cannot create a duplicate payment under concurrent or repeated execution.
  Why now: PayPal entitlement, payout semantics, webhooks/reconciliation, and duplicate-money protection are the highest external risk in the core journey. Proving them before document AI avoids building a polished analyzer around an unproven money-movement path.
  PRD ref: `prd.md > The Core Journey`, `prd.md > Payment Detail and Decision Evidence`, `prd.md > AI Security, Authority, and Traceability`
  Spec ref: `spec.md > PayPal payment execution`, `spec.md > Payment Executor`, `spec.md > APIMatic`, `spec.md > Important Failure Modes`
  Build: Use APIMatic Context Plugin while implementing the direct server-side PayPal Payouts REST adapter; add OAuth token caching, permanent PostgreSQL logical-payment uniqueness, deterministic PayPal correlation IDs, transactional execution claiming, payout state mapping, verified webhook handling/reconciliation, reporting-balance adapter, and audit events around the authority boundary. Preserve evidence that APIMatic was used.
  Verify (mechanical): Run payment/idempotency tests including two concurrent executor attempts, lost-response retry with identical IDs, unknown-outcome handling, and a simulated retry beyond PayPal's duplicate window; with sandbox env configured, execute one one-item payout and reconcile its item state from PayPal without a second logical payout.
  Learner check: Trigger the normal seeded invoice, open its payment detail, and confirm you can follow one MandateGate logical payment to one PayPal Sandbox payout ID and state.
  Commit: `wire paypal`

- [ ] **3. A real PDF or image invoice can enter the same kernel safely**
  Becomes usable: An operations-agent request can upload a PDF/JPEG/PNG invoice, MandateGate stores the exact artifact, extracts typed invoice facts with provenance, validates them, and feeds the resulting canonical request into the already-working decision kernel.
  Why now: Document interpretation is the second major external/security risk. This slice proves hostile/unstructured input cannot become authority and that model/provider privacy controls fail closed.
  PRD ref: `prd.md > The Core Journey`, `prd.md > Payment Detail and Decision Evidence`, `prd.md > AI Security, Authority, and Traceability`
  Spec ref: `spec.md > Artifact Store`, `spec.md > Invoice Analysis Pipeline`, `spec.md > AI Gateway`, `spec.md > Background execution`, `spec.md > Hackathon artifact storage`
  Build: Add PostgreSQL `bytea` ArtifactStore, bounded file admission, SHA-256 integrity metadata, PDF.js text/page preparation, bounded rasterization, Experiential route preflight/ZDR enforcement, GLM structured JSON-schema extraction, Zod validation, field-level evidence/provenance, async analysis adapter, and explicit extraction-failure/escalation states.
  Verify (mechanical): Run the invoice fixture suite covering text PDF, scanned PDF, JPEG/PNG, malformed/truncated/password-protected/oversized documents, missing or ambiguous payment fields, destination substitution, prompt injection, invalid model schema output, unsupported model route, and artifact-hash/provenance consistency; with Experiential env configured, run one live normal-invoice extraction through a compliant route.
  Learner check: Upload a normal invoice and inspect the extracted amount/vendor/destination plus page-level evidence; then upload a hostile or malformed fixture and confirm it escalates or fails closed instead of inventing authority.
  Commit: `add invoice intake`

- [ ] **4. Historical behavior can escalate an anomalous invoice for human review**
  Becomes usable: An admin can import AP history, MandateGate derives vendor/company behavioral context, a near-duplicate or unusual-amount invoice escalates, and the admin can decline or accept with a mandatory explanation and optional evidence.
  Why now: This completes the second canonical demo path and proves MandateGate adds value beyond a static allowlist.
  PRD ref: `prd.md > Payment Detail and Decision Evidence`, `prd.md > Escalation Review`, `prd.md > Activity`, `prd.md > What We're Building > P0 — release blockers`
  Spec ref: `spec.md > Historical / Behavioral Analysis`, `spec.md > AP history CSV import`, `spec.md > Policy and Decision Engine`, `spec.md > Next.js Admin Application`, `spec.md > Trail Writer`
  Build: Add versioned AP CSV import, canonical row validation/provenance, vendor/company baselines, deterministic near-duplicate and unusual-amount evidence, escalation state/detail UI, accept/decline prepared-action binding, required explanation, optional evidence attachment, and activity events.
  Verify (mechanical): Run CSV parsing/import tests for duplicates, malformed/ambiguous rows, formula-like cells, import replay/versioning, and vendor-destination non-authority; run anomaly fixtures and prove the target invoice becomes ESCALATE, decline creates no execution row/PayPal call, and accepted action binds exact current state.
  Learner check: Import the demo AP history, open the anomalous invoice, inspect exactly why it escalated and where that evidence came from, then decline it with an explanation and confirm no payout exists.
  Commit: `add escalation flow`

- [ ] **5. A destination substitution is blocked and moved to re-verification**
  Becomes usable: An invoice that requests a different payment destination cannot become trusted through the ordinary approval path; MandateGate denies/blocks it, shows the mismatch, and enters explicit vendor re-verification state.
  Why now: This is the sharpest proof of the product's trust boundary and completes the third canonical P0 demo scenario.
  PRD ref: `prd.md > Vendor Trust and Re-verification`, `prd.md > Payment Detail and Decision Evidence`, `prd.md > The Core Journey`
  Spec ref: `spec.md > Vendor Trust Service`, `spec.md > Policy and Decision Engine`, `spec.md > Payment Executor`, `spec.md > Important Failure Modes`
  Build: Add authoritative vendor/destination state, mismatch comparison, block/deny reason codes, simulated out-of-band re-verification transition, vendor trust UI/history, and hard guards that prevent ordinary invoice/admin approval from trusting a new destination.
  Verify (mechanical): Run vendor-trust integration/adversarial tests proving a changed invoice destination produces DENY/BLOCK, no payment execution, no trust mutation, and a re-verification state; prove only the explicit simulated re-verification path can establish a new trusted destination.
  Learner check: Run the destination-change scenario and confirm the UI makes the attempted retargeting and blocked authority boundary obvious.
  Commit: `lock vendor trust`

- [ ] **6. The complete P0 journey runs on Render**
  Becomes usable: The three canonical scenarios run against the hosted Render environment with PostgreSQL, Key Value, Workflows where required, Cron configuration present, PayPal Sandbox credentials server-side, and a health/readiness surface.
  Why now: Deployment is itself a critical integration risk. Moving the already-green P0 journey onto Render before P1/P2 means every later feature lands on the actual judging environment instead of a local fiction.
  PRD ref: `prd.md > The Core Journey`, `prd.md > Dashboard Behavior`, `prd.md > What We're Building > P0 — release blockers`
  Spec ref: `spec.md > Render`, `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Render deploy contract`, `spec.md > Environment-variable contract`, `spec.md > Background execution`, `spec.md > Cache / ephemeral coordination`
  Build: Create the Render web/database/key-value/workflow/cron configuration and adapters, deploy migrations and synthetic demo seed safely, wire internal authenticated Valkey only for non-authoritative cache/coordination, expose health/readiness, and configure the hosted demo without publishing secrets.
  Verify (mechanical): Build locally, deploy the exact commit, verify Render health/readiness, database migration/seed, workflow execution, cache-loss tolerance, and run hosted smoke tests for normal ALLOW→Sandbox payout, anomaly ESCALATE→no payout, and destination DENY→re-verification.
  Learner check: Use the hosted app as a judge would and run all three P0 scenarios end to end; note anything confusing, visually weak, or unlike the product you intended.
  Commit: `deploy p0`

- [ ] **7. The dashboard becomes a judge-ready investigation surface**
  Becomes usable: The hosted dashboard presents balance/spend/urgent states and lets an admin investigate payments, vendors, risks, and trail context through AG Studio / AG Grid without giving the dashboard any authority to mutate money or trust.
  Why now: P0 is already operational, so this P1 slice can improve design/presentation without becoming a dependency of the core payment path.
  PRD ref: `prd.md > Dashboard Behavior`, `prd.md > Screens and Layout`, `prd.md > Payment Detail and Decision Evidence`
  Spec ref: `spec.md > AG Grid / AG Studio`, `spec.md > Next.js Admin Application`, `spec.md > Dashboard balance source`, `spec.md > Look and Feel`
  Build: Integrate AG Studio/AG Grid through the server-side read-oriented adapter, add current PayPal reporting balance with timestamp/degraded state, spend/upcoming/overdue/urgent summaries, risk/evidence filtering, responsive investigation layouts, and the approved warm minimal Norse visual direction.
  Verify (mechanical): Build/typecheck, run dashboard adapter/data-shape tests, verify balance unavailability never fabricates a value, and confirm no AG/assistant dashboard tool exposes payment/trust/policy mutation authority.
  Learner check: Explore the hosted dashboard and one payment investigation; judge whether the hierarchy, density, explanations, and visual identity are presentation-ready.
  Commit: `polish dashboard`

- [ ] **8. Policies and the Assistant can explain and prepare, but not authorize**
  Becomes usable: Admins can review/edit/activate inferred policy proposals, and the persistent MandateGate Assistant can investigate authoritative data and prepare exact consequential actions for explicit human confirmation without becoming an authority itself.
  Why now: These P1 capabilities broaden the platform while exercising the most important AI authority and prepared-action boundaries already proven by P0.
  PRD ref: `prd.md > Policy Review`, `prd.md > MandateGate Assistant Behavior`, `prd.md > AI Security, Authority, and Traceability`
  Spec ref: `spec.md > Policy and Decision Engine`, `spec.md > MandateGate Assistant`, `spec.md > AI Gateway`, `spec.md > System One Decision Layer`
  Build: Add inferred policy proposal lifecycle and activation UI, persistent assistant context over read-authorized MandateGate data, explanation/query/navigation tools, immutable prepared-action digests with expiry/state/policy binding, explicit admin confirmation, stale-action regeneration, and trail separation of AI proposal vs human authorization.
  Verify (mechanical): Run policy lifecycle and assistant-adversarial tests for no-authority-before-activation, prompt injection, hostile retrieved content, retarget attempts, chat-only “yes”, stale state/policy, vendor trust changes, and exact action digest mismatch; prove all failures escalate/reject rather than commit.
  Learner check: Ask the Assistant why an invoice was escalated, have it prepare a consequential action, then change underlying state and confirm the old prepared action cannot commit.
  Commit: `add assistant policies`

- [ ] **9. An accepted escalation can be scheduled safely on a visible timeline**
  Becomes usable: An admin can choose delayed execution, see it on the Bryntum timeline, cancel it, or let Render Cron execute it only after full execution-time revalidation.
  Why now: Scheduling is P1 and touches money movement, so it comes only after immediate payments, prepared actions, vendor trust, and hosted deployment are proven.
  PRD ref: `prd.md > Escalation Review`, `prd.md > Payments`, `prd.md > What We're Building > P1 — planned hackathon features`
  Spec ref: `spec.md > Scheduled jobs`, `spec.md > Due-payment runner`, `spec.md > Bryntum Scheduler`, `spec.md > Payment Executor`
  Build: Add `scheduled_for`, SCHEDULED/SCHEDULE_REVIEW_REQUIRED/CANCELLED transitions, due-payment claim/revalidation runner, Render Cron invocation, cancellation/review behavior, and Bryntum read/interaction adapter that routes consequential changes back through prepared-action confirmation.
  Verify (mechanical): Run scheduling tests for not-before execution, service restart persistence, concurrent runner invocation, cancellation, stale policy/vendor trust causing SCHEDULE_REVIEW_REQUIRED, and exactly one execution claim; verify Bryntum interactions cannot mutate authority directly.
  Learner check: Schedule an accepted payment a few minutes ahead, see it on the timeline, then alter trust/policy or cancel it and confirm the due runner refuses stale/cancelled execution.
  Commit: `add safe scheduling`

- [ ] **10. Anchored history detects attempts to rewrite consequential events**
  Becomes usable: MandateGate serializes its local trail, creates signed Merkle checkpoints, anchors them to the append-only Base Sepolia registry, and an independent verifier reports local/anchored/broken states without trusting the application database's anchor pointer.
  Why now: This P1 slice turns the audit trail into a memorable security differentiator after the core financial behavior is stable.
  PRD ref: `prd.md > AI Security, Authority, and Traceability`, `prd.md > Activity`
  Spec ref: `spec.md > Trail Writer`, `spec.md > Trail Integrity / Checkpoint Service`, `spec.md > Independent Trail Verifier`, `spec.md > External checkpoint witness`
  Build: Implement RFC 8785 canonical event hashing, serialized per-org stream heads, Merkle checkpoints, Ed25519 signatures, independent verifier, Foundry CheckpointRegistry contract/tests, viem deployment/root config, Base Sepolia anchor client, safe-head confirmation, integrity states/UI, and checkpoint Cron.
  Verify (mechanical): Run parallel-writer/rollback/truncation/fork/signature/checkpoint tests, `forge build && forge test`, deploy or use the committed Base Sepolia registry, anchor a checkpoint, mutate already-anchored local history and prove BROKEN, alter local anchor metadata and prove the verifier still derives the canonical chain from the registry, and prove competing sequence/previous-hash writes revert.
  Learner check: Open an anchored payment history, verify it, then run the provided tamper fixture and confirm the verifier changes to BROKEN while the public registry remains unchanged.
  Commit: `anchor trails`

- [ ] **11. Elastic adds fast similarity and investigation without gaining authority**
  Becomes usable: Historical invoice/vendor/trail data is projected into Elastic for search, similarity, and investigation, while PostgreSQL remains authoritative and the core payment path still works when Elastic is unavailable.
  Why now: This is P2 differentiation. It comes after the complete authority/payment/integrity path so Elastic can remain genuinely optional rather than becoming accidental source of truth.
  PRD ref: `prd.md > Payment Detail and Decision Evidence`, `prd.md > Dashboard Behavior`, `prd.md > Activity`
  Spec ref: `spec.md > Elastic`, `spec.md > Historical / Behavioral Analysis`, `spec.md > Important Failure Modes`
  Build: Add rebuildable Elastic projections for invoice similarity, vendor behavior, and trail search; minimum-field indexing; projection/rebuild jobs; investigation adapters; and explicit degraded behavior that falls back to PostgreSQL or escalates when optional search evidence is unavailable.
  Verify (mechanical): Run projection/rebuild/search tests, prove indexed documents omit prohibited secret/raw-auth fields, compare known similarity fixtures, delete/rebuild the index, and disable Elastic to confirm P0/P1 payment authorization still behaves correctly.
  Learner check: Search for the anomalous invoice/vendor/trail context through the investigation UI, then disable the projection and confirm the core decision/payment controls still work.
  Commit: `add elastic search`

- [ ] **12. External agents can use the API through Zapier and reviewers can replay it through Postman**
  Becomes usable: A real Zapier MCP operations-agent path can submit/query MandateGate using a scoped machine principal, and a public-safe Postman collection documents/replays the same API with synthetic fixtures.
  Why now: These P2 integrations demonstrate that MandateGate is a platform boundary rather than a demo-only UI, without changing who owns financial authority.
  PRD ref: `prd.md > The Core Journey`, `prd.md > AI Security, Authority, and Traceability`
  Spec ref: `spec.md > Zapier MCP`, `spec.md > Postman`, `spec.md > Agent API`, `spec.md > Authentication`
  Build: Finalize scoped agent API contracts and idempotency behavior, configure API by Zapier connection/tool actions for submit/status, create a secret-free Postman collection/environment with synthetic fixtures and integrity/status endpoints, and capture sponsor-use evidence.
  Verify (mechanical): Run API-scope/authorization tests proving machine principals cannot become admin or call direct payment/policy/trust mutations; validate the collection JSON and replay its synthetic requests against the hosted environment; execute a Zapier-originated submission and confirm it enters the same canonical MandateGate trail/decision path.
  Learner check: Submit the normal fixture from Zapier or replay it in Postman, then inspect MandateGate and confirm the external client can request and observe but cannot bypass the authority boundary.
  Commit: `open agent api`

- [ ] **13. Challenger models and bounded AI security judgments are evaluated against adversarial fixtures**
  Becomes usable: MandateGate can route selected harder cases to Qwen, use Jev bounded judgments only within their allowed monotonic role, compare Laya on the same fixtures, and expose the resulting evidence without allowing any model to clear deterministic blocks or authorize payments.
  Why now: This is the final P2 AI/security differentiation. It belongs after the deterministic product path is complete so model evaluation can measure advisory value instead of becoming a dependency for basic correctness.
  PRD ref: `prd.md > AI Security, Authority, and Traceability`, `prd.md > MandateGate Assistant Behavior`
  Spec ref: `spec.md > AI model layer`, `spec.md > System One Decision Layer`, `spec.md > AI Gateway`, `spec.md > Important Failure Modes`
  Build: Pin the live Jev model identifier, implement explicit GLM/Qwen routing and challenger evidence, wire Jev bounded judgments, run Laya as an evaluation comparator rather than an authority, add adversarial fixture scoring, retain provider/ZDR route metadata, and surface disagreements/confidence as evidence that can only maintain or increase caution.
  Verify (mechanical): Run the full AI evaluation gate over clean extraction, malformed docs, near duplicates, destination substitution, direct/indirect injection, poisoned history/notes, malicious tool output, retargeting, stale state, provenance loss, and authorization bypass; fail the slice if any model can fabricate surviving payment-critical facts, clear a deterministic block, retarget an action, bypass confirmation, or weaken the ZDR/no-training requirement.
  Learner check: Inspect one clean and one adversarial case side by side and confirm the UI/evidence makes model disagreement visible while the deterministic payment outcome remains unchanged unless caution increases.
  Commit: `bound ai routes`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 6, run the hosted P0 journey and use feedback to shape P1/P2 UI and presentation
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [what actually happened; real document/test/code references; unfinished work if interrupted]
Route and stops: [actual paths and symbols; guided stops completed, or reference-only route]
Edit outcome: [tried/kept/reverted/declined/not applicable; verification if changed]
Reflection: [offered/answered/declined/already covered — personal answer belongs only in the ignored profile]
Activity mode: [live app and editor, explicit static fallback, focused alternative, prior practice, or recap]

## Revisions

