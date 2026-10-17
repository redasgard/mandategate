# MandateGate

**The firewall between autonomous agents and your money.**

MandateGate is an authorization and payment-risk boundary for autonomous accounts-payable (AP) agents. Agents may request vendor payments and supply invoices, but they do **not** receive PayPal credentials or the right to authorize a payout. Independently enforced policy, vendor trust, organization boundaries and human review determine whether a request is `ALLOW`, `ESCALATE` or `DENY`.

Built for the PayPal AI Hackathon 2026. The working product and longer-term roadmap are broader than the hackathon submission.

## What the current demo actually proves

There are **three separate evidence paths**. They should not be presented as one already completed invoice-to-payment transaction.

| Path | Current evidence | Important limit |
| --- | --- | --- |
| **AI interprets a fictional invoice** | Actual saved Experiential Labs GLM-5.3 Flash observations of exact-SHA-allowlisted fictional documents, after recorded admin consent to possible provider retention. The model proposed fields; the result remained **T1 advisory `ESCALATE`**. | This consented synthetic route is **not** strict account-level ZDR. No GLM observation authenticates an issuer or authorizes a payment. |
| **MandateGate makes deterministic decisions** | An authenticated three-case preview loads normal `ALLOW`, unusual amount `ESCALATE` and destination substitution `DENY`, with source-visible reason codes and payment detail links. It is repeatable and refuses suspicious replay state. | These are synthetic, separate canonical requests, **not** the AI-observed PDFs. No payout occurs through judge replay. |
| **PayPal Sandbox executes a protected payout** | In an **earlier Render environment**, the direct trusted-agent Slice 2 path created one real Sandbox payout (batch `BA7V96FCY8Z64`, item `A3R9LWD8XTX72`), then recorded PayPal `SUCCESS`, local `PAID`, verified webhook and reconciliation evidence. The judge page links that archived record. | It was **not** triggered by the AI-reviewed invoices. The current Neon-backed demo has no corresponding payment execution rows. Displaying archived identifiers does not re-verify PayPal settlement today. |

**Full invoice-derived GLM → verified PDF facts (T2) → independently authenticated issuer (T3) → exact human payment authority (T4) → PayPal payout is not complete.** Strict Gate H remains **BLOCKED**: the hosted account did not satisfy the strict full-ZDR preflight, and live independent issuer/payment proof is still missing. Do not treat a seeded or synthetic issuer channel as genuine external issuer verification.

The evidence table with limitations and original sources is at [devpost/judge-evidence-matrix.md](devpost/judge-evidence-matrix.md). The authoritative release checklist is at [devpost/checklist.md](devpost/checklist.md).

## Hosted judge walkthrough

Development demo: **https://mandategate-web.onrender.com/demo**

The demo requires a signed-in, organization-authorized account. **External judge access has not yet been independently verified** and must be confirmed before submission; there is no shared password in this repository.

1. Open **/demo** after sign-in. Inspect the saved fictional GLM observation cards and click through to the original invoice artifacts. Merely viewing the cards makes **no new model request**.
2. Click **Load or replay three demo decisions**. This writes/reuses three synthetic canonical requests through the deterministic decision engine; it **does not execute PayPal**. Review the observed `ALLOW`, `ESCALATE`, `DENY` and actual reason codes. If the page halts for inconsistent outcomes or financial state, **stop** rather than resetting evidence silently.
3. Inspect the **Historical PayPal Sandbox** section and follow the links to the **earlier** payout ledger and critical review. It is a *separate previous workflow*, not the receipt for any GLM-observed invoice.
4. Optional: use **/ap-history** to explicitly import the fictional AP CSV and explore history-based anomalies. This is a separate history exercise, not the source of the three initially seeded policy decisions.

These steps are a scripted **demonstration**, not a claim of production payment readiness. Authenticated local HTTP smoke and Render deployment confirm code and reachability; a separately witnessed hosted browser visual walkthrough remains a release check.

## Implemented versus targeted stack

**Implemented / independently tested to the indicated boundary:**

- Next.js, TypeScript, Node.js, PostgreSQL / Drizzle, Better Auth, authenticated scoped agent ingestion and admin review
- Render web-hosted development build; Neon-backed isolated payments-disabled judge preview
- Deterministic payment-policy decisions, tenant-bound invoices and provenance, PDF/image artifact storage, PDF.js source parsing, T2 review controls, historical AP import and destination mismatch guards
- PayPal Payouts REST Sandbox, permanent idempotency and webhook/reconciliation, with **historical** live Slice 2 proof
- Experiential Labs GLM-5.3 Flash with **consented fictional T1 observations only** on the separate synthetic lane, and strict provider-privacy fail-closed checks

**Targeted but not release-verified:** persistent Assistant, inferred-policy activation, scheduling / Bryntum, AG Grid investigation, tamper-evident Merkle + Base Sepolia anchoring, Elastic, Zapier MCP, Postman demonstration collection, and Qwen / Jev / Laya challenger evaluation. Inclusion in the architecture does **not** mean those integrations are live.

The design and scope live in [devpost/spec.md](devpost/spec.md) and [devpost/scope.md](devpost/scope.md). The 13-slice implementation checklist currently accepts Slices 1–2; Slices 3–7 have partial work and Slices 8–13 are not yet accepted.

## Run locally (no paid services needed for core checks)

Prerequisites: **Node.js 24**, **pnpm 12.9.1**, **PostgreSQL 18**, and a private local development database.

Until the pending Slice 3 development branch is reviewed and integrated into `main`, the hosted preview source is on **`build/slice-3-invoice-intake`**, not the default clone branch.

```sh
git clone https://github.com/redasgard/mandategate.git
cd mandategate
git switch build/slice-3-invoice-intake
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Before proceeding, fill **`.env.local`** with locally generated, unique secrets and your local PostgreSQL URL. Required for the basic seed/login:

- `DATABASE_URL` pointing to **your own** local PostgreSQL database, `BETTER_AUTH_SECRET` (strong random secret) and `BETTER_AUTH_URL=http://localhost:3000`
- `DEMO_ADMIN_EMAIL` and **`DEMO_ADMIN_PASSWORD` set before the first seed** (at least 12 characters). The seed **does not print the password** or recover one if the account already exists.
- Distinct `DEMO_AGENT_API_KEY` and `DEMO_PAYMENT_AGENT_API_KEY` (each at least 32 non-whitespace characters); the invoice-only principal and privileged payment principal have different scopes.
- Leave `PAYPAL_BASE_URL` at the Sandbox host. PayPal OAuth keys, external AI keys, and optional sponsor credentials are **not required** for local deterministic, non-paying tests. Never use production financial accounts or real customer invoices in a demo.

```sh
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

Sign in at http://localhost:3000/sign-in and use **/dashboard**, **/invoice-artifacts** and **/ap-history** for supported local workflows.

**Important:** the special hosted **/demo** judge lab is intentionally gated to its designated Neon-preview environment with `MANDATEGATE_DISABLE_PAYMENTS=1`. It is **not** enabled automatically on an arbitrary local PostgreSQL installation. This is a payment-safety control, not a missing setup step.

For CI-style checks against an isolated development database:

```sh
pnpm typecheck
pnpm test
pnpm build
```

`pnpm smoke` additionally requires an authenticated local running server and the configured synthetic admin/agent test credentials. It changes **test** database state; keep it off shared accounts. `pnpm gate-h:inventory` is read-only and always reports a non-authorizing evidence inventory. **Do not run `pnpm gate-h:sandbox submit`**, `pnpm verify:slice2:sandbox`, or payment execution endpoints as routine setup or judge replay. They are financial test actions with separate approval rules.

## Security and evidence boundaries

- An invoice, PDF text, model response, assistant action or tool result is untrusted input, never a source of issuer identity or payment permission.
- T2 parser-text verification confirms *what the document says*, not whether the issuer is genuine. A T3 out-of-band issuer assertion needs independently inspected evidence, pre-enrolled before arrival; a synthetic fixture or after-the-fact channel is not equivalent.
- T4 requires an authenticated exact tuple review with current recipient/policy binding. No one-off approval, prior payout, or test fixture can become blanket payment authority.
- Privileged payment credentials stay server-side. Agent keys are scoped; the request/decision, authorization and executor boundaries are separate.
- Exact logical-payment idempotency, recipient checks and webhook signature/reconciliation paths are tested. Production durability, independent WORM storage and external Merkle anchoring remain **future work**, not current proof.
- The synthetic non-ZDR GLM exception is limited to exact allowlisted fictional files with explicit admin consent. Normal strict inference remains **fail closed** without the required account/provider privacy evidence.
- Hosted payments-disabled judge replay must not produce an outbound PayPal Payouts request.

## Delivery status and hackathon submission

**Internal hard target: submitted Devpost entry by October 29, 2026, 6 PM Pacific.** October 30–31 are emergency buffer only; work is not planned into November. This is earlier than the competition's published deadline.

The repository is currently **private**, and the default `main` branch has not yet received the current development-branch demo. Before declaring submission-ready we must independently verify: public MIT-licensed release with correct default branch/tag, clean-clone setup, actual judge access and stable data service through judging, a public YouTube demo under three minutes, accurate Devpost content and the platform's **submitted entry confirmation URL**. None of those publication outcomes is implied by this README.

See [devpost/october-2026-execution-plan.md](devpost/october-2026-execution-plan.md), [devpost/gate-h-live-runbook.md](devpost/gate-h-live-runbook.md), the [historical payout review](devpost/reviews/slice-2-critical-review.md), and [LICENSE](LICENSE).
