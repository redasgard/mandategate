# MandateGate decision log

## 2026-10-08 — Retire unnecessary paid Render staging

- **Decision:** Use one development/demo environment for the PayPal AI Hackathon. The separate paid Gate H staging PostgreSQL and extra web service are not required.
- **Why:** The existing app is development, not production. Git branch isolation, CI, rollback and PayPal Sandbox sufficiently contain hackathon integration risk.
- **Retired approach:** Extra Render staging service and paid DB with environment-specific host/user gates. Their creation introduced cost and a Corepack build failure without providing judge-visible value.
- **Safety boundary retained:** Sandbox-only Payouts, issuer and human authorization, immutably source-bound invoice fields, exact tuple and idempotency checks, adversarial GLM model observations untrusted, one test Payouts POST maximum.
- **Implementation:** code commit `df9b7608e5b1a7038a4318148eb979e2daa1217d`. `devpost/gate-h-live-runbook.md` now covers the single demo environment.
- **External cleanup:** `srv-db4367u0tbcc73cugar0`, `dpg-db4351rl550s73acup8g-a` deletion **PENDING**. Render connector cannot delete these resources. The paid database accrues charges until deleted in Dashboard.
- **Release state:** Gate H BLOCKED; no Slice 3 PayPal transfer or GLM live model proof.

## 2026-10-08 — Complete the actual human source-review demo path before expanding infra

- **Decision:** Keep the Slice 3 work centered on user-visible untrusted invoice upload, pre-invoice vendor channel registry and sourced manual review in the existing development environment.
- **Delivered branch code:** Admin raw-byte upload, tenant/session checks and transaction revalidation; origin-channel enrollment tied to a pre-existing vendor and immutable SHA-256 digest; signed-in UI for both; real CI HTTP PDF parser and five-field source verifier.
- **Evidence:** `b52ca996b64b3f7bd9a404f7edaaa71fbc837342`, GitHub Actions `37874974336` (SUCCESS, 28 files/172 tests; prod HTTP smoke).
- **Critical distinction:** Human enrollment and synthetic portal-event references are not external issuer verification; PDF T2 verifies document text, not authenticity. Nothing authorizes payment without T3+T4.
- **Unverified:** Hosted user journey, live GLM model serving/ZDR and invoice-originated Sandbox payout/webhook. Gate H BLOCKED.
