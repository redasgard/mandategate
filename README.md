# MandateGate

Zero-trust authorization and policy layer for AI agents that can spend money.

MandateGate sits between an autonomous operations agent and PayPal. Agents can submit vendor invoices and request payment, but they never receive payment credentials or payment authority. MandateGate independently evaluates invoice facts, historical behavior, vendor trust, and active policy, then returns `ALLOW`, `ESCALATE`, or `DENY`.

Current release milestone: PayPal AI Hackathon 2026. MandateGate itself is the product; the hackathon is a release target, not the product boundary.

## Demo

The current release centers the demo on three paths:

1. Known vendor + normal invoice -> `ALLOW` -> PayPal Sandbox payout.
2. Near-duplicate / unusual invoice -> `ESCALATE` -> admin declines -> no payout.
3. Changed payment destination -> `DENY` + vendor re-verification required.

The security boundary is the product: AI may interpret, explain, and prepare actions, but deterministic MandateGate controls decide what is authorized and the payment executor alone can call PayPal.

## Release priorities

P0, P1, and P2 are all targeted for the November hackathon submission. The tiers define build order and emergency cut priority, not product scope.

- **P0:** end-to-end invoice authorization, trusted-destination enforcement, escalation, permanent idempotency, PayPal Sandbox execution, evidence trail, three canonical demo scenarios.
- **P1:** Assistant, policy lifecycle, scheduled payments, Base Sepolia integrity witness, AG Studio / AG Grid, Bryntum timeline.
- **P2:** Elastic, Zapier MCP, Postman, challenger/evaluation model work, sponsor-integration polish.

Nothing in P1/P2 is allowed to destabilize the P0 money-movement boundary.

## Stack

- Next.js / TypeScript / Node.js
- PostgreSQL + Drizzle
- Better Auth
- Render Web Service, Postgres, Key Value, Workflows, and Cron
- PayPal Payouts Sandbox
- Experiential Labs with GLM-5.3 Flash / Qwen3.8 routing
- TypeSafe Jev bounded decisions
- AG Studio / AG Grid
- Elastic
- Bryntum Scheduler
- Base Sepolia append-only checkpoint registry
- Postman and Zapier MCP integration surfaces

See `devpost/spec.md` for the authoritative technical design.

## One development environment for the hackathon

Use the existing Render development app and existing free PostgreSQL database with **PayPal Sandbox** and synthetic invoices. A separate paid staging environment is **not** a requirement. The former Gate H staging-only infrastructure plan is superseded; see `devpost/gate-h-live-runbook.md` for the single-environment acceptance test and manual deletion of the extra paid resources.

Live Payouts stay sandbox-only. No model observation or invoice text is payment authority without verified source evidence, trusted issuer channel, an authenticated approval and a one-time explicit test grant.

## Slice 3 invoice reviewer demo (development branch)

On `build/slice-3-invoice-intake`, the signed-in admin UI offers:

1. `/vendor-origin-channels`: register a previously known vendor callback, portal, or ERP source **before** an invoice arrives. A checked box and digest are human evidence assertions, not proof that the vendor actually responded.
2. `/invoice-artifacts`: upload the original PDF, PNG, or JPEG as untrusted bytes. The UI enforces the admin's organization membership and stores its SHA-256. No agent token is necessary for this manual demo.
3. `/invoice-artifacts/[id]` (PDF): inspect the original source and independently parsed page text, record five typed/payment-critical field quotes and page numbers, and verify source fidelity as T2.
4. Confirm the issuer through the previously known out-of-band source (T3), evaluate the server-frozen exact payment tuple, and navigate to `/invoice-bindings/[id]` for a separate signed-in review. Without real issuer evidence, the proposal **ESCALATES** and does not produce a payout.

These routes are **CI-verified source-review code, not deployed or externally verified proof yet**. The GitHub Actions checkpoint `37874974336` executes the HTTP upload/parse/T2/negative proposal path with a synthetic fixture and **no PayPal payout**. The isolated GLM and payment gates remain separate.

## Local setup

Prerequisites:

- Node.js 24 LTS
- pnpm 12.9.1
- PostgreSQL 18

```bash
git clone https://github.com/redasgard/mandategate.git
cd mandategate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

Open `http://localhost:3000/sign-in`, then continue to `http://localhost:3000/dashboard`. `pnpm demo:seed` creates the synthetic demo admin; local credentials are supplied through local-only seed variables or generated once and printed to the terminal.

`pnpm demo:seed` uses synthetic hackathon fixtures. Do not place production credentials or real sensitive invoice data in a public clone.

External integrations require their corresponding values from `.env.example`. Base Sepolia anchor writes can remain disabled locally; when disabled, the UI must show history as locally verified / pending external anchor rather than externally verified.

## Demo readiness

The hosted Render demo is the primary judging path and must prove:

- real PayPal Sandbox payout for the normal invoice
- anomaly escalation without payout
- destination mismatch block
- scheduled-payment execution/revalidation
- independent checkpoint verification against the Base Sepolia registry
- sponsor integrations used in their documented roles

No production money or production PayPal credentials are used.

## Security notes

- Operations-agent credentials cannot become admin sessions.
- Models and sponsor tools are advisory/non-authoritative.
- Payment idempotency is enforced permanently in PostgreSQL, not delegated to PayPal's remote duplicate window.
- Invoice payment destinations are never authoritative vendor destinations.
- Every consequential action is bound to an immutable prepared-action digest and revalidated before commit.
- Trail history is hash-chained, checkpointed, signed, and externally anchored for tamper evidence.
- Production should add separately administered WORM retention and isolated signing for independent recoverability.

## Project docs

- `devpost/scope.md`
- `devpost/prd.md`
- `devpost/spec.md`
- `docs/plans/2026-10-06-mandategate-design.md` preserves the original design rationale and is superseded by the spec for implementation decisions.

## Hackathon submission

The repository is intentionally private during active development. Before Devpost submission it must be made public. The project is licensed under MIT; see `LICENSE`. The final submission also needs the hosted/testable build instructions, public YouTube demo under three minutes, and the Devpost project description/tool disclosures required by the current official rules.

