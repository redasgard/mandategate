# Hosted Sandbox verification packet | October 18, 2026 PT

**Gate: BLOCK for new payout and final release.** This is an evidence-backed, nonfinancial checkpoint, not a completed payment or signed-in judge test.

## Exact observed baseline

- GitHub development branch `build/slice-3-invoice-intake` head at inspection: `04ed2b8694292aca0a512068b53238658fe2b263`. PR #44 (isolated $1.01 payment interface) and PR #45 (boolean-only startup diagnostic) are **merged** into that development branch; PR #2 into public-facing `main` is still **draft/unmerged**. Repository visibility is **private**.
- Render `mandategate-web` (`srv-db39vmm7bikc73c55nh0`): deployment `dep-dbaqifmq1p3s73cn6gm0` reported **LIVE** at the exact `04ed2b8` commit. This proves a running code revision, **not** a passing test suite or signed-in feature behavior.
- GitHub Actions [run 39204033885](https://github.com/redasgard/mandategate/actions/runs/39204033885) at exact `04ed2b8`: **FAILURE before test execution**; job `117902862293` reported no steps. Private hosted minutes were previously confirmed exhausted. No 2026-10-18 full-stack test result may be inferred from the successful Render deploy.
- Startup configuration report, as recorded by the previous [PR #44 checkpoint](https://github.com/redasgard/mandategate/pull/44): explicit `neon-sandbox` / payment-enabled opt-in, Sandbox API selected, ID and secret presence flags true, configured test receiver flag true. These are **boolean-only earlier log observations**, not independent validation of the receiver's PayPal ownership or live OAuth credentials. The current connected Render log reader did not provide workspace access for independent reinspection.
- The source `scripts/runtime-profile.mjs` forwards PayPal credentials in `neon-sandbox` only with explicit payment enablement and Sandbox host. `src/payments/executor/postgres-store.ts` checks the fixed `sandbox_fixture` organization, vendor, invoice, USD 101 cents, current destination and policy on both initial and pre-submission authority reads. This is **source inspection**, not end-to-end financial verification.

## Independently observed current Neon data (read-only)

Connected Neon project `mandategate-hackathon` (`floral-hill-01811323`), default database, read-only SELECTs on October 18 PT:

| Scope | Observed |
| --- | ---: |
| `org_paypal_sandbox_demo` payment requests | **0** |
| `org_paypal_sandbox_demo` payment executions | **0** |
| `org_demo` payment executions | **0** |
| `org_demo` payment requests | **3** |

The three persisted `org_demo` decisions were:

| Invoice | Amount | Decision | Reason |
| --- | ---: | --- | --- |
| `DEMO-NORMAL-2026` | $1,200 USD | ALLOW | WITHIN_TRUSTED_BASELINE |
| `DEMO-ANOMALY-2026` | $2,800 USD | ESCALATE | AMOUNT_OUTSIDE_VENDOR_BASELINE |
| `DEMO-SUBSTITUTION-2026` | $1,200 USD | DENY | DESTINATION_MISMATCH |

A Northstar **$125** request is **not among these three persisted demo payment requests**. Do not tell a tester it is a prepared or executed Sandbox payout. The separate historical PayPal Payouts receipt is **not invoice-derived** and is **not** stored as a current Neon execution.

Read-only query basis:

```sql
select
 (select count(*)::int from payment_requests where organization_id='org_paypal_sandbox_demo') as sandbox_requests,
 (select count(*)::int from payment_executions pe join payment_requests pr on pr.id=pe.payment_request_id where pr.organization_id='org_paypal_sandbox_demo') as sandbox_executions,
 (select count(*)::int from payment_executions pe join payment_requests pr on pr.id=pe.payment_request_id where pr.organization_id='org_demo') as judge_org_executions,
 (select count(*)::int from payment_requests where organization_id='org_demo') as judge_org_requests;
```

## Acceptance order (no unauthorized money movement)

1. **G2 / exact-source build:** On an authenticated, isolated private checkout at `04ed2b8`, use Node 24, pnpm 12.9.1 and PostgreSQL 18 to run frozen install, migrations/seed repeat, runtime-profile tests, **all Vitest tests**, typecheck, production build and authenticated HTTP smoke. The draft Docker fallback [PR #37](https://github.com/redasgard/mandategate/pull/37) may help, but a simulated Docker invocation or the exhausted zero-step GitHub checks do not count. Record exact SHA, commands, outputs and failure cases. Do not switch Render from `checksPass` to unchecked deployment.
2. **Safety review:** Recheck `neon-sandbox` execution source filter, current owner+organization authorization at both request time and immediately before PayPal, trusted destination, exact 101-cent policy, single fixed idempotency key, revocation and concurrency races. Independently test no PayPal POST for `org_demo` replay or any non-`sandbox_fixture` request. Complete a second-person finance/security review before making release claims.
3. **Operator-authenticated *prepare* (no PayPal):** Log into the hosted [Sandbox payout page](https://mandategate-web.onrender.com/sandbox-payout) with the actual development ADMIN account; independently confirm the intended **Sandbox** test receiver and fixed **USD 1.01** amount before clicking **Prepare**. Do not publish credential/receiver values. Observe exactly one new canonical sandbox request, decision ALLOW, zero sandbox executions and zero `org_demo` executions. Capture request UUID and logical payment ID securely.
4. **H1 separate exact grant:** Only after steps 1-3 PASS, seek explicit approval for **one** fixed, logical-payment-ID-bound **USD 1.01 PayPal Sandbox** POST to the confirmed recipient. The user saying "continue", a PR merge or an already payment-capable runtime **does not authorize** a new payout. Never auto-run a payout or silently retry with a new idempotency key.
5. **Authenticated execute and reconcile:** Following H1, the owner uses the separate **Execute** control on the fixed payment detail. Verify Sandbox OAuth and actual PayPal payout identifiers, webhook signature and terminal state or explicit pending/unknown state; then requery one payment execution and verify `org_demo` still has zero. Do not call an HTTP 200 from the app itself evidence of settled PayPal money movement.
6. **Judge release:** Two separate clean authenticated reviewer sessions, confirmed revoked-user denial, actual read-only persisted outcomes, no admin capabilities and no financial side effects. Verify SHA parity, backup/restore and December availability, updated sub-three-minute video and Devpost proofs, and clean public MIT `main` only after separate publication approval.

**Scope boundary:** This fixed trusted synthetic $1.01 demo does **not** complete strict `GLM T1 → document T2 → independent issuer T3 → payment T4 → PayPal` Gate H. Strict non-ZDR account privacy controls remain fail-closed. No real money, new PayPal submission, external model call, database mutation, Render environment change or public publication was performed to make this packet.
