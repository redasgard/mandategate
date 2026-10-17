# MandateGate | Devpost Submission Draft

**Status:** INTERNAL DRAFT, NOT SUBMITTED. All copy is conditional on final source release, hosted judge access, actual video evidence and the final release review.
**Owner delivery goal:** October 29, 2026, 6:00 PM Pacific. This is earlier than the official November 12, 2026, 12:00 PM Pacific competition deadline.
**Official rules rechecked:** October 16, 2026 at https://paypalaihackathon.devpost.com/rules
**Source baseline for claims:** development branch `build/slice-3-invoice-intake` and `devpost/judge-evidence-matrix.md`; do not silently upgrade claims from draft PRs or unverified deployments.

## Project title

MandateGate

## Tagline

The authority firewall between autonomous agents and your money.

## Short description

An AI-assisted accounts-payable security boundary: autonomous agents can submit invoices and propose payments, but deterministic vendor trust, policy, explicit review and a protected PayPal executor decide what is allowed, escalated or denied.

## Inspiration

Operations agents are becoming capable of handling invoices and payment workflows. But an invoice is a claim, not permission. A forged supplier message, substituted destination, or convincing AI output could turn automation into an unauthorized payment.

MandateGate separates the agent's ability to *request* a payment from the company's authority to *make* it. The goal is to help businesses automate accounts payable while retaining explainable controls over recipients, amounts, approvals and money movement.

## What it does

MandateGate acts as a financial authorization layer between an operations agent, untrusted invoice data and PayPal Sandbox Payouts.

- Stores original PDF/image invoice artifacts with SHA-256 provenance and supports independent PDF source-text review. Model assertions do not automatically become verified source facts.
- Uses **GLM-5.3 Flash**, through an Experiential Labs route, to interpret **consented fictional invoice material** in a bounded advisory test lane. Observed model output remains **ESCALATE**; no AI-generated field grants payment authority.
- Applies an independently implemented, tenant-bound policy engine to synthetic canonical requests and returns **ALLOW**, **ESCALATE**, or **DENY** with human-readable reason codes and evidence.
- Rejects changed payment destinations rather than allowing invoice text to silently alter a trusted vendor record. Anomalous amounts are escalated for investigation.
- Contains a separate server-side PayPal Payouts REST Sandbox executor with logical-payment idempotency, state reconciliation and verified webhook handling. Its real Sandbox proof comes from an **earlier direct trusted-agent test**, not from the GLM-observed invoices.

The current judge demo displays these **three evidence paths separately**. A complete AI-image-to-authenticated-issuer-to-exact-approval-to-PayPal payout is **not yet demonstrated** and is not represented as complete.

## How we built it

The web app uses **Next.js, TypeScript, PostgreSQL/Neon, Drizzle, Better Auth, PDF.js and Render**. Payments use **PayPal Payouts REST Sandbox** from a protected server-side execution path. Image interpretation uses **Experiential Labs GLM-5.3 Flash** with saved model provenance and bounded fictional-only consent.

The design deliberately separates payment facts, the decision kernel, human approval and execution. Requests have organization boundaries, reason codes, immutable provenance and logical idempotency keys. Payment submission and invoice-observer machine identities have distinct scopes. The demonstration environment enforces an explicit payments-disabled mode.

Render is used to host the live demo. A historical Sandbox event demonstrates the PayPal Payouts API and webhook/reconciliation boundary, while live judge replay intentionally does not send payouts.

## Challenges

The hardest part was resisting the temptation to treat an AI-produced extraction as payment authority. A model can quote a plausible invoice total or recipient without proving that the document came from the real supplier.

We separated verification into distinct steps: an original artifact, independently parsed field evidence, separately established issuer provenance, exact approval and finally PayPal execution. In the current demo, proof beyond the advisory T1 source is not conflated with the completed historical PayPal integration. Tests also cover multiple/conflicting recipients, malformed amounts, duplicate payments, unknown outcomes, revoked credentials and fail-closed safeguards.

Privacy created another boundary: the recorded fictional-only GLM test used explicit consent to possible provider retention. This is **not** proof of full account-level zero data retention, so strict production-like provider routing remains blocked pending actual entitlement/evidence.

## Accomplishments

- Working deterministic **ALLOW / ESCALATE / DENY** decision path with inspectable reasons, distinct from any model-inferred invoice payment.
- Real saved GLM-5.3 Flash observations for consented fictional invoices, preserving source and serving-route evidence without granting payment authorization.
- Archived evidence from a successful **direct trusted-agent PayPal Sandbox payout**, including its payout batch/item identity, verified webhook and reconciliation to a paid state in an earlier environment.
- Tenant-bound invoice intake and review, source-hash lineage, and tests that deliberately fail closed on destination substitution, missing proofs and payment replay.
- A hosted payment-disabled demo on Render, with repeatable, explainable decisions and a separate historical PayPal evidence panel.

**Do not claim:** a current GLM-derived PayPal payout, production ZDR compliance, live independently verified vendor issuer callback, a production-ready financial product, external append-only WORM/Merkle anchoring, or completed optional sponsor integrations without future acceptance evidence.

## What we learned

AI can help read financial documents, but trustworthy payments require a boundary the model cannot cross by persuasive language or an apparently precise answer. Idempotent execution, explicit recipient binding and provenance are as important as model quality. Clear evidence limits make a financial automation demo more credible, not less.

## What's next

Complete independently authenticated issuer provenance and exact approval before any invoice-derived payout. Prove a strictly privacy-compliant model invocation under a verified provider entitlement, finish end-to-end adversarial tests and recovery, and expand the operations console, review workflows, scheduling, integrity anchoring and optional sponsor integrations only after the core money boundary is accepted.

These are roadmap items, not features claimed as running in the current submitted candidate.

## Technology tags (only implemented uses)

PayPal Payouts Sandbox; GLM-5.3 Flash; Experiential Labs; Next.js; TypeScript; Node.js; PostgreSQL; Neon; Drizzle; Better Auth; PDF.js; Render.

**Optional sponsor categories:** Render is in use for hosting. Do not select AG Grid, APIMatic, Bryntum, Elastic or other sponsor categories unless actual qualifying integration and acceptance are verified before submission.

## Functional testing instructions for judges (DRAFT, credentials not yet provisioned)

1. Open `https://mandategate-web.onrender.com/demo` and authenticate with a **dedicated, payments-disabled fictional judge test account**, to be provisioned and supplied under an appropriate access method before publication. Existing development admin credentials are **not** to be published here.
2. In the `Saved fictional GLM observations` section, inspect the advisory output and original PDF link. Example artifact: `DEMO-GLM-004` is a *model-proposed* Northstar Components USD 125.00, not a payable verified invoice.
3. Run **Load or replay three demo decisions**. Confirm `ALLOW / WITHIN_TRUSTED_BASELINE`, `ESCALATE / AMOUNT_OUTSIDE_VENDOR_BASELINE`, and `DENY / DESTINATION_MISMATCH` on the **separate synthetic** requests.
4. Open one decision detail, then inspect the `Historical PayPal Sandbox` card. Its batch/item records belong to a separate earlier direct-agent integration proof and are provided with archived evidence links.
5. Verify that the demo's **local payment execution record count is zero** before and after replay. The model cards never send a new AI request and the judge replay never sends PayPal payments.

**Stop condition:** Do not give these instructions to judges until a distinct authorized login is tested, current Render source-SHA parity/health and replay are witnessed, no credentials or privacy-sensitive records leak, and the instance remains available through the December 1-15 judging window. If hosted access is not possible, publish genuinely reproducible clean-clone instructions that meet official rules instead.

## Devpost link fields: placeholders, not live submissions

- **Source repository:** `https://github.com/redasgard/mandategate` (EXISTS but **CURRENTLY PRIVATE**, default `main` does not yet contain full candidate. Must be public and licensed at release).
- **Functional hosted demo:** `https://mandategate-web.onrender.com/demo` (EXISTS, login required; dedicated external judge access NOT verified).
- **YouTube video:** **NOT CREATED OR PUBLISHED.** Must be public, show a functioning app and be strictly under three minutes.
- **Public Devpost submission:** **NOT CREATED OR VERIFIED.** A final submitted-entry confirmation URL is required.

## Evidence attached to the claims

- `devpost/judge-evidence-matrix.md`: separate model, deterministic decisions and historical PayPal proof.
- `devpost/judge-video-recording-packet.md` (draft PR #36): proposed 2:30 video, five capture segments and explicit source caveats.
- `devpost/gate-h-live-runbook.md`: currently blocked T2/T3/T4/strict privacy/payment prerequisites.
- `devpost/october-2026-execution-plan.md`: original scope and owner-locked date, not evidence of completion.
- `devpost/reviews/slice-2-critical-review.md` plus the archived build ledger: historical PayPal integration record.
- Official rules: https://paypalaihackathon.devpost.com/rules

## Release checklist, not yet completed

- [ ] Full final financial/auth/security review and safe release candidate SHA/tag accepted
- [ ] GitHub Actions runner entitlement repaired; exact-head CI passes, source/deploy parity verified
- [ ] Publish correct MIT-licensed open-source `main` with clean setup and no secrets
- [ ] Judge authentication tested in an isolated, safe demo account
- [ ] Demo availability and restoration path verified for December judging
- [ ] Actual signed-in visual walkthrough and no-payout scenario replay witnessed
- [ ] Record and verify a public, working UI video shorter than 3 minutes
- [ ] Paste exact current implemented-claim copy and all validated URLs into Devpost
- [ ] Submit entry by October 29, 2026, 6 PM Pacific and record confirmation URL

**This document is a copy/paste candidate, not proof of submission readiness or any resulting public action.**
