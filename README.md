# MandateGate

Zero-trust authorization and policy layer for AI agents that can spend money.

MandateGate sits between an autonomous operations agent and PayPal. Agents can submit vendor invoices and request payment, but they never receive payment credentials or payment authority. MandateGate independently evaluates invoice facts, historical behavior, vendor trust, and active policy, then returns `ALLOW`, `ESCALATE`, or `DENY`.

Built for the PayPal AI Hackathon 2026.

## Demo

The POC demonstrates three paths:

1. Known vendor + normal invoice -> `ALLOW` -> PayPal Sandbox payout.
2. Near-duplicate / unusual invoice -> `ESCALATE` -> admin declines -> no payout.
3. Changed payment destination -> `DENY` + vendor re-verification required.

The security boundary is the product: AI may interpret, explain, and prepare actions, but deterministic MandateGate controls decide what is authorized and the payment executor alone can call PayPal.

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

## Local setup

Prerequisites:

- Node.js 24 LTS
- pnpm 12.10.1
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

Open `http://localhost:3000/dashboard`.

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

The repository is intentionally private during active development. Before Devpost submission it must be made public and include an approved open-source `LICENSE` file. The final submission also needs the hosted/testable build instructions, public YouTube demo under three minutes, and the Devpost project description/tool disclosures required by the current official rules.

