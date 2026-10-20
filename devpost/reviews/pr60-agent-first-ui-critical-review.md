# PR #60 | PRD-first operations UI critical review

**Date:** 2026-10-20 PT
**Step:** Replace upload-first human invoice workflow with agent-first payment operations console
**Decision:** BLOCK merge/deploy; isolated draft development remains permissible
**Standard score (self-review):** 7.9 / 10
**Visual score:** UNVERIFIED; no screenshot/hosted PR #60 visual walkthrough
**Gate:** BLOCK (release evidence and visual inspection absent)
**Review independence:** self-review

## Evidence checked

- Approved `devpost/prd.md`: operations agent creates the request; normal ALLOW under current valid mandate executes automatically, while ESCALATE/DENY require investigation.
- Draft PR #60 head at review time: `5b306a05b8f557bfd88fdc55ac1a15ec08483a35`; based on draft PR #59 `71a305c9...`, not merged into `main` or production.
- Source: shared `app/components/operations-header.tsx`, Dashboard/Payments/Vendors/Policies/Activity/Autopay, payment investigation, operational inbox queries and read-only status helpers. Browser action and PayPal code unchanged.
- Neon Postgres 18 project `mandategate-hackathon`, **SELECT-only** schema inspection confirmed observation timestamps `started_at` / `finished_at` and **no** `invoice_image_observations.created_at`. Fixed incorrect ordering in `src/db/operations-inbox.ts`. The complete bounded query then executed successfully using a deliberately nonexistent actor and returned zero rows. Recipient-comparison, scoped review and payment-list SQL were also submitted successfully with nonexistent principals and zero results.
- New/updated Vitest suites: `tests/dashboard-invoice-intake-entry.test.tsx`, `tests/judge-dashboard-boundary.test.ts`, `tests/operations-inbox.test.tsx`, `tests/payments-view.test.ts`, `tests/payment-detail-state.test.ts`, `tests/trusted-recipient.test.ts`, `tests/invoice-intake-status.test.ts`.
- GitHub Actions `39471626525`: **failure** before inspectable steps; job `verify` has no steps/logs. This does NOT prove source tests were executed, nor identify the failure cause. Previous passed tests on PR #59's older SHA do not validate this head.
- The existing Render CI static site `mg-erp-ci-20261019` is pinned to PR #59's branch and auto-deploy is off. No service change or production deployment was made.

## Artifact scores

| Artifact | Score | Main weakness |
| --- | ---: | --- |
| Shared operations UI and styling | 8.1 | Real mobile/desktop visual quality not inspected |
| Dashboard and Payments workflows | 8.2 | No integrated authenticated HTTP proof of exact PR head |
| Read-only inbox/trust projections | 8.2 | Syntax and schema observed, end-to-end scoped data behavior still untested |
| Regression tests and smoke | 7.6 | Source authored, not run on latest commit |
| Release readiness | 4.5 | GitHub Actions unavailable; no usable isolated PR #60 preview; parent PR #59 not release-accepted |

## Findings

1. **HIGH: exact-head release verification absent.** Tests, migrations, Next build and auth smoke have not executed on current PR #60. **Repair:** run frozen install, PostgreSQL18 migrations/seed twice, typecheck, Vitest, production build and signed-in smoke on an isolated payment-disabled worker bound to exact SHA. Preserve zero PayPal POSTs.
2. **HIGH: actual visual QA absent.** CSS review does not prove accessibility, viewport hierarchy or mobile behavior. **Repair:** authenticated browser on isolated PR #60 build at desktop/mobile, inspect Dashboard, Payments, payment investigation, Vendors, Policies, Activity and mandate subpage; capture screenshot evidence and fix failures.
3. **MEDIUM: parent release branch is itself still draft.** PR #60's Git base is PR #59, whose invoice-derived PayPal and webhook acceptance is not proven. **Repair:** keep PR #60 draft/unmerged; never conflate GUI design readiness with financial functionality.
4. **MEDIUM: incoming uploaded invoice → independently authenticated issuance → payment request → mandate dispatch is not wired end to end.** The new inbox makes uploaded documents visible but cannot claim autonomous invoice payments work. **Repair:** separate P0 backend acceptance packet after the UI review; do not fabricate pending provider state.
5. **LOW: paid state is presented as recorded status, not current remote settlement.** This is deliberate conservative labeling; future read-side PayPal reconciliation would improve customer clarity.

## Requirements

**SOURCE-SUPPORTED / CODE-IMPLEMENTED:** shared primary navigation, agent-first Dashboard/Payments, read-only incoming documents with unverified model suggestions, decision and payment states separated, escalation review retained, trusted-recipient comparison, manual USD 1.01 control demoted to bounded test/fallback.

**SQL-VERIFIED:** read-only current-schema inbox query, trusted-recipient lookup, active-membership review query and payment-list query compile against actual Neon PostgreSQL 18 with nonexistent actor, yielding zero results.

**UNVERIFIED:** exact-head runtime tests/build, real invoice source-to-request completion, mobile/desktop render, actual role-scoped user data, independent review, payment integration acceptance and any public judge preview.

## Repair order and next gate

1. Obtain isolated exact-head execution without increasing paid infrastructure or opening access to customer data. Diagnose GitHub CI billing/runner status or use an explicitly approved isolated test service.
2. Correct any actual compiler/test/smoke failures. Do not claim 512 passing tests from PR #59 apply to PR #60.
3. Complete authenticated visual QA and tenant/role tests, then obtain an independent security review for financial UI.
4. Re-review exact immutable SHA and parent PR #59 merge/deployment restrictions. Gate may change to CONTINUE only after sufficient evidence; until then **BLOCK merge/deploy**.
