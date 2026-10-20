# MandateGate

**The firewall between autonomous agents and your money.**

MandateGate is the **PayPal AI Hackathon application**. AI interprets
invoices; deterministic vendor, source, risk and payment-authority rules
control whether a requested payout may execute. Agents never receive
PayPal credentials or independent payment authority.

## Operational workflow: agent → MandateGate → PayPal

MandateGate is **agent-driven**. A company operations agent, not the dashboard
operator, supplies invoice evidence and payment requests. The application is a
monitoring, exception-review and standing-authority control surface.

1. An authorized agent can send a PDF, PNG or JPEG invoice directly to
   `POST /api/agent/invoice-artifacts` using its scoped `invoice:upload` key.
   The untrusted original is stored with a content hash. Structured requests
   enter via a separate `POST /api/agent/payment-requests` endpoint with
   `payment:submit` scope and an idempotency key.
2. **Dashboard → Payments** exposes received documents and canonical requests.
   Document extraction/GLM interpretation is untrusted evidence, not payment
   approval; independently sourced issuer/trust checks and policies own authority.
3. MandateGate records `ALLOW`, `ESCALATE` or `DENY`. A trusted routine
   request should pay automatically **only under a separately activated, current
   standing mandate**. Exceptions require human investigation; changed recipients
   are blocked pending independent re-verification.
4. The server-side PayPal Sandbox executor owns the payout, permanent
   idempotency and signed webhook/reconciliation. An `ALLOW` decision or a
   submitted batch is not proof of final PayPal settlement.

**Implementation limit:** Both scoped agent ingress endpoints exist, but the
complete raw-agent-invoice → AI → authoritative verification → autonomous payout
handoff has **not** been verified end to end. The standing-mandate preflight
does not itself mean an unattended payment job is running.

### Separate Sandbox test lane, not the product workflow

The fictional Northstar USD 1.01 invoice and manual source/approval/Execute
buttons are a bounded integration test. They remain under supporting invoice
evidence tools; they are **not** an invoice the user is meant to download and
upload as ordinary accounts-payable processing. The fictional source assertion
does not authenticate a real supplier.

## Current execution evidence

The PayPal Payouts API and webhook reconciliation code are implemented.
An earlier independent Sandbox payment was completed, but it **does not**
prove the latest invoice-derived path. This path is accepted only when its
own approved invoice, PayPal POST, batch/item statuses and verified webhook
are observed together. Source/test logs and decision history must not be
presented as completed money movement.

See [the invoice execution runbook](devpost/sandbox-invoice-demo-runbook.md)
and [current checklist](devpost/checklist.md) for exact evidence and blockers.

## Run locally (no paid services needed for core checks)

Prerequisites: **Node.js 24**, **pnpm 12.9.1**, **PostgreSQL 18**, and a private local development database.

The currently hosted application follows **`build/slice-3-invoice-intake`**, not the default `main` branch.

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
- Leave `PAYPAL_BASE_URL` at the Sandbox host. PayPal OAuth keys, external AI keys, and optional sponsor credentials are **not required** for local deterministic, non-paying tests. Never use production financial accounts or real customer invoices in this hackathon build.

```sh
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

Sign in at http://localhost:3000/sign-in and use **/dashboard**, **/payments**, **/vendors**, **/policies** and **/activity** as the primary operational surfaces. Invoice evidence upload and AP history import remain supporting tools.

**Important:** read-only test fixtures are isolated and cannot pay. Actual PayPal execution is available only with explicit Sandbox credentials and payment authorization.

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
- The hackathon AI route does not require account-level ZDR. Invoice content may be retained by the external provider. Keep test data separate from live customer information.
- Read-only policy tests must not produce an outbound PayPal Payouts request; an independently approved invoice can be sent through the real Sandbox API.

## Delivery status and hackathon submission

**Internal hard target: submitted Devpost entry by October 29, 2026, 6 PM Pacific.** October 30–31 are emergency buffer only; work is not planned into November. This is earlier than the competition's published deadline.

The repository is currently **private**, and the default `main` branch has not yet received the current hackathon application build. Before declaring submission-ready we must independently verify: public MIT-licensed release with correct default branch/tag, clean-clone setup, actual judge access and stable data service through judging, a public YouTube video showing the functioning application under three minutes, accurate Devpost content and the platform's **submitted entry confirmation URL**. None of those publication outcomes is implied by this README.

See [devpost/october-2026-execution-plan.md](devpost/october-2026-execution-plan.md), [devpost/gate-h-live-runbook.md](devpost/gate-h-live-runbook.md), the [historical payout review](devpost/reviews/slice-2-critical-review.md), and [LICENSE](LICENSE).
