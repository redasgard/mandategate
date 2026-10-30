# MandateGate | Judge access and reproduction

**Status as of October 29, 2026:** Hosted service previously verified live; exact current external health and signed-in judge access must be rechecked. Never publish an administrator account or any real provider credentials.

## Public links

- Application: https://mandategate-web.onrender.com
- Repository: https://github.com/redasgard/mandategate **(PRIVATE until release action)**
- Current tested application branch: `build/slice-3-invoice-intake` (the `main` branch is stale; do not judge `main` until corrected)
- Recorded tests: see `devpost/continuation-status-20261025.md` and latest Render CI evidence
- Historical, separate PayPal Sandbox receipt: `devpost/reviews/slice-2-critical-review.md`
- Public demo video: not yet provided

## Reproducible local path: deterministic, no financial transfers

Prerequisites: Node.js 24, pnpm 12.9.1, PostgreSQL 18, Git.

```bash
git clone https://github.com/redasgard/mandategate.git
cd mandategate
git switch build/slice-3-invoice-intake
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Configure local `.env.local` with an **isolated local PostgreSQL** `DATABASE_URL`, a fresh random `BETTER_AUTH_SECRET` (at least 32 characters), `BETTER_AUTH_URL=http://localhost:3000`, `DEMO_ADMIN_EMAIL`, and a newly generated `DEMO_ADMIN_PASSWORD` (minimum 12 characters). Set two different local-only `DEMO_AGENT_API_KEY` and `DEMO_PAYMENT_AGENT_API_KEY` values, each at least 32 characters. Set `MANDATEGATE_DISABLE_PAYMENTS=1`; **do not** supply PayPal credentials, external AI keys or real invoices. Follow `.env.example` and README if runtime flags differ. Do not commit any local secrets.

```bash
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

Sign in at http://localhost:3000/sign-in with the locally configured administrator. **Do not rely on `/demo` when running the default local `legacy` profile:** that route is intentionally enabled only in gated Neon preview/Sandbox modes.

To exercise the **real scoped agent API and policy kernel** on a clean local database, submit these three fictional requests to `POST /api/agent/payment-requests` using the **local-only** `DEMO_PAYMENT_AGENT_API_KEY`. Set `MANDATEGATE_DISABLE_PAYMENTS=1` in `.env.local` before starting; use a fresh idempotency key per request. Do not supply PayPal credentials.

| Case | invoiceNumber | amountCents | paymentDestination | Expected |
| --- | --- | ---: | --- | --- |
| Normal | `LOCAL-JUDGE-NORMAL-2026` | 120000 | `ap@northstar.example` | ALLOW |
| Unusual amount | `LOCAL-JUDGE-ANOMALY-2026` | 280000 | `ap@northstar.example` | ESCALATE |
| Changed recipient | `LOCAL-JUDGE-DESTINATION-2026` | 120000 | `changed-payee@synthetic.invalid` | DENY |

For each case, send JSON with `vendorId="vendor_northstar"`, `currency="USD"` and the fields above, plus `Authorization: Bearer <your local payment-agent key>`, `Content-Type: application/json`, and an `Idempotency-Key` header of at least eight characters. The corresponding decision and reason codes should appear on the Payments screen. `paymentExecuted` must be `false`.

Example for the normal case (enter the **local** agent key, never a real provider credential):

```bash
read -rsp "Local payment-agent key: " MG_PAYMENT_KEY; echo
curl --fail-with-body --silent --show-error \
  -X POST http://localhost:3000/api/agent/payment-requests \
  -H "Authorization: Bearer $MG_PAYMENT_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: judge-normal-local-2026" \
  --data '{"vendorId":"vendor_northstar","invoiceNumber":"LOCAL-JUDGE-NORMAL-2026","amountCents":120000,"currency":"USD","paymentDestination":"ap@northstar.example"}'
unset MG_PAYMENT_KEY
```

Repeat with the other two case values and distinct idempotency keys. An imported AP history may **escalate** a request, so use the freshly seeded database and do not mislabel a changed outcome as a successful fixed scenario. From the invoice evidence screen, inspect the proof-readiness checklist. These synthetic policy cases never constitute settled PayPal payments.

To run the automated test suite, use `pnpm test`, `pnpm typecheck` and `pnpm build` against the isolated database. The fully provisioned Render CI additionally exercises two migrations, two seeds, authenticated loopback smoke and real Chromium desktop/mobile checks.

## Hosted judge credentials

This site requires sign-in. A **restricted, non-admin REVIEWER** account is supported for the special `/judge` route, but it must be provisioned through the approved, payment-disabled procedure, independently checked and delivered privately via Devpost testing instructions. No approved judge email/password or current live successful sign-in was established during final packaging. Do **not** publish credentials in GitHub.

If restricted access is not confirmed, the complete reproducible local path above is the primary rule-compliant judge access mechanism. A live sign-in screen alone is not a functional judge demo.

## Evidence classes

1. **Real, persisted synthetic policy decisions:** ALLOW / ESCALATE / DENY. These are not invoice-derived paid transactions.
2. **Model observations:** saved consented fictional GLM output, with no financial authority.
3. **Real PayPal Sandbox historical payout:** one older direct trusted-agent request with successful provider status and webhook/reconciliation evidence; not a new payment from the fictional PDFs.

The same invoice-to-payment chain has **not** been independently verified. Never imply a fictional issuer is real, a policy ALLOW is a payout, or a prior settlement occurred during the current recording.

## Test safety

Judge evaluation must be repeatable without real transfers, production credentials, privileged database access or personally identifying documents. Do not expose direct payment execution to anonymous visitors. Clear or separate any synthetic demonstration data before a real environment is used.
