# MandateGate

**The firewall between autonomous agents and your money.**

MandateGate is built for the **PayPal AI Hackathon**. AI interprets
invoices; deterministic vendor, source, risk and payment-authority rules
control whether a requested payout may execute. Agents never receive
PayPal credentials or independent payment authority.

## Hackathon judging and submitted capabilities

- **Hosted application:** https://mandategate-web.onrender.com (sign-in required).
- **Complete local setup:** follow *Run locally* below with an isolated PostgreSQL 18 database and generated secrets; disable payments for local review.
- **Devpost submission text:** [submission-copy-final.md](devpost/submission-copy-final.md)
- **Judge testing instructions:** [final-judge-instructions.md](devpost/final-judge-instructions.md)
- **Real-browser demonstration plan:** [final-demo-script.md](devpost/final-demo-script.md)
- **Judge evidence matrix:** [judge-evidence-matrix.md](devpost/judge-evidence-matrix.md)
- **Historical PayPal Sandbox receipt:** [Slice 2 verification](devpost/reviews/slice-2-critical-review.md). The application also exposes an authenticated read-only `/sandbox-evidence` page.

The three persisted demonstration decisions are synthetic and **do not** represent three payments. Saved GLM observations are advisory and do not create permission to pay. A separate bounded end-to-end settlement has been executed on the Sandbox demo: the reviewed invoice `MG-SANDBOX-101-2026` (USD 1.01) completed human approval and **exactly one** PayPal Sandbox payout (batch `8H4CEWS6ZBVZE`, item `PNMP9YWACK74E`), reconciled automatically to PAID; the demo video shows this live. The earlier Slice 2 PayPal Sandbox receipt remains a **separate historical transaction**. Production PayPal remains out of scope.

**Submission target:** the PayPal AI Hackathon on Devpost (submission window closes **November 12, 2026, 12:00 PM PT**). The repository default branch is `hackathon`; the release is under the MIT License.

## Tools and technologies

- **PayPal Payouts REST API (Sandbox)** — the payment execution layer: server-side OAuth, durable idempotency (exactly one POST per approved payment), asynchronous payout tracking (batch + item ids), signed webhook receipts and automated reconciliation.
- **GLM-5.3 Flash (Experiential Labs)** — advisory AI: extracts invoice fields and risk observations. Its output is stored as untrusted evidence and can never grant payment authority.
- **AG Grid (Community)** — the payment-decision ledger on the investigation surface: sortable columns, quick filtering and pagination over the administrator's scoped records, themed to the product shell.
- **Render** — hosting and push-to-deploy for the Next.js application (this repository deploys to it automatically).
- **Neon PostgreSQL** — persistence for payment requests, decisions, invoices, authority records and evidence.
- **Next.js · React · TypeScript · Better Auth · Drizzle ORM** — application and authentication stack.
- **Playwright / Vitest** — browser testing and demo recording pipeline / the 572-test suite.

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

A prepared request or an `ALLOW` policy decision is not a completed payout. Only authenticated provider evidence can establish its remote status.

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

The application lives on the repository default branch (**`hackathon`** — the same commit tree the hosted deployment follows via `build/slice-3-invoice-intake`).

```sh
git clone https://github.com/redasgard/mandategate.git
cd mandategate
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

## Hackathon submission

Built for the **PayPal AI Hackathon** on Devpost (submission window closes **November 12, 2026, 12:00 PM PT**). The repository default branch is `hackathon`; the release is under the [MIT License](LICENSE). The demo video and hosted-application links are provided in the Devpost submission; the judge path (local run + reproducible agent API cases) is documented in [devpost/final-judge-instructions.md](devpost/final-judge-instructions.md).

See the [judge instructions](devpost/final-judge-instructions.md), the [evidence matrix](devpost/judge-evidence-matrix.md), the [historical payout review](devpost/reviews/slice-2-critical-review.md), and [LICENSE](LICENSE).
