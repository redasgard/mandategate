# Gate H staging and Sandbox runner: security gate

## Critique gate

**Step:** Construct reproducible, explicitly authorized, one-shot staging Sandbox ALLOW/ESCALATE/DENY runner and prepare live verification.
**Decision:** CONTINUE with isolated staging **preflight preparation only**. **BLOCK** all payment execution and release until workspace, external origin, hosted reviewer, real provider, and Sandbox conditions are proven.
**Score:** 8.5/10 for mechanically bounded runner; **release readiness remains 6.0/10 or lower**.
**Review independence:** self-review plus GitHub Actions deterministic checks. No independent external tester has yet observed deployment, provider or payment.

### Evidence checked
- Commit `6e0a5d82fe29168daf50110b676d07dbd7bc541e`; GitHub Actions `37856559061` SUCCESS with 24 files / 160 tests, TypeScript, migration/seed twice, build, smoke.
- `src/gate-h/sandbox-proof.ts`: explicit staging/isolated database/operator consent requirements; exact $1.01 USD Sandbox receiver/hash/approved-PDF provenance check; distinct negative artifacts; pure physical-network POST fence that prevents second payout POST and denies non-Sandbox host.
- `scripts/verify-gate-h-sandbox.ts`: separate read-only preflight, one-time submit and read-only verify; causal reasons for ESCALATE and DENY; zero new payment executions during negatives; original approved binding consumed once; repeat-safe single Payout POST; remote batch/item and verified webhook/reconciliation checks; fresh account metadata recheck; no CI invocation.
- `tests/gate-h-sandbox-proof.test.ts`: environment, grants, exact amount/destination/source constraints, zero-bind negative decisions and second-Payout-POST refusal.
- `devpost/gate-h-live-runbook.md` defines required external proofs and cleanup.

### Artifact scores
| Artifact | Score | Main weakness |
|---|---:|---|
| Explicit one-shot payout guard | 9.0 | Physical fence tracks this script's adapter only, not unrelated service traffic |
| Negative evaluation and causal check | 8.6 | No real deployed issuer/contact artifacts yet |
| Verified webhook/reconciliation gate | 8.6 | Code expects events, not yet witnessed |
| Real-origin and GLM provider evidence | 5.0 | Must obtain from external systems |
| Hosted staging isolation | 4.0 | Render service and DB not yet confirmed or inspected |

### Findings
1. **HIGH (release-only): Render workspace and isolated database unconfirmed.** The connected Render API refuses listing/services without explicit user workspace selection. No staging deployment can be truthfully claimed. User must confirm workspace; verify distinct database and secrets before any trial payout.
2. **HIGH (release-only): Independent issuer authenticity absent.** Repo seed channel is synthetic, so it is not eligible for real payment authority. Human callback/ERP evidence must actually exist, predate invoice, and be independently checked. A hash or typed `callback-record` is not proof of a real call.
3. **HIGH (release-only): Live GLM provider privacy/adversarial evidence absent.** Only metadata/API mock CI has run. Actual served request ID and route header verification must be witnessed, using independently validated synthetic content.
4. **HIGH (release-only): Real PayPal payout and verified webhook absent.** Runner was not invoked and no external Sandbox payout was sent. CI cannot prove a real POST.
5. **MEDIUM: Submitted proof's one-POST fence covers only this runner's gateway object.** Independent PayPal Sandbox account audit and Render traffic logs must verify no other payout activity during the isolated window.
6. **MEDIUM: Operator environment flags are assertions, not independent authority evidence.** Review staging database identity, original issuer receipt and code SHA outside the script.

### Requirement coverage
- VERIFIED: isolated guard/type tests, positive/negative deterministic behavior, correct installed code and scripts; exact one-POST adapter fence; 160 tests CI passed.
- UNVERIFIED: workspace/staging, external supplier, real signed-in reviewer, GLM serving, PayPal actual batch/item/webhook; post-proof cleanup.
- INCORRECT: calling Gate H or any actual paid invoice complete, or equating a synthetic Northstar fixture with a real vendor issuer.

### Repair order
1. User confirms exact Render workspace; create isolated staging and verify DB/secret separation.
2. Obtain independent real vendor channel evidence **before** invoice upload; create validated T2/T3/T4 human reviewed staging tuple, plus negative artifacts.
3. Record actual Experiential privacy/account and allowlisted GLM serving proof, then disable inference flags.
4. User explicitly authorizes one Sandbox $1.01 execution in that isolated environment; run submit **once**, reconcile webhook, audit PayPal Sandbox, and run separate final independent review.

### Next gate
**BLOCK** Gate H release and live payout until the above external evidence is observed and verified. Code preparatory stage may continue; do not deploy stable or merge draft PR.
