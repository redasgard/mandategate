# Neon cutover readiness gate (2026-10-14)

Status: **BLOCKED — no live database switch authorized or executed**

Review independence: **self-review**.

## Evidence
- Neon bootstrap, seed, credential recovery, read-only security, and HTTP authorization GitHub Actions completed, including successful HTTP agent scope tests: https://github.com/redasgard/mandategate/actions/runs/38676125203
- Render service `srv-db39vmm7bikc73c55nh0` currently uses branch `build/slice-3-invoice-intake`, `autoDeploy=yes`, `autoDeployTrigger=checksPass`, and startup command `pnpm db:migrate && pnpm demo:seed && pnpm start` (connected Render service inspection).
- Repository `scripts/seed.ts` synchronizes demo agent principal keys to environment variables on every run and does not update the existing admin password. Recovery established secrets directly in Neon, not necessarily Render.
- Neon has zero payment executions from prior verification. This is not evidence that all payment endpoints are safe after cutover.
- Existing Render PostgreSQL records were explicitly excluded from the fresh-Neon path; no historical data was migrated.

## Critical findings
1. **BLOCKER: startup credential drift.** Blind cutover while `pnpm demo:seed` is in Render startup can replace recovered demo machine credentials with Render-configured values, leaving the admin password unchanged. This risks inconsistent login/agent authorization.
2. **BLOCKER: payments are not proven inert.** Existing Render application can have PayPal credentials, webhook recovery and payment routes. An isolated Neon HTTP test did not exercise a production-like cutover or prove all integrations safe. Absolutely no new PayPal payout without separate exact approval.
3. **BLOCKER: rollback and environment binding unverified.** No tested procedure exists to atomically switch the app back without seeding or schema alterations; the live Render database must remain untouched.
4. **HIGH: test coverage.** HTTP tests covered authentication and selected machine scopes. They did not verify all authorization routes, multi-tenant isolation, idempotency, webhook recovery, GLM integration, dashboard functionality, or real sandbox payment flows.
5. **HIGH: migration reproducibility.** Neon SQL migrations 0000–0019 were installed through connected SQL tools, with some operations adjusted for fresh-schema conditions, not via one end-to-end canonical migration-runner execution against Neon. Need an idempotency dry-run/backup before a startup `db:migrate` re-run.
6. **MEDIUM: seeded state vs demo presentation.** DB contains synthetic fixtures; real original Render historical demo payment proofs are not present on Neon.

## Required repair sequence
1. Create an isolated no-payments deployment (not the existing Render service), with Neon secrets stored only in protected environment configuration, no real PayPal credentials, no webhook recovery on startup, no recurring migrations or seed on every restart.
2. Validate fresh instance on Neon: admin login, agent separation, dashboard, invoice intake, tenant boundaries, and *zero* payment execution side effects.
3. Freeze an explicit Render cutover manifest: exact service branch/SHA, environment variable names (not values), startup command, current database source, proposed target, rollback instructions, authorized payment-mode policy.
4. Verify rollback in isolation, preserve the existing Render PostgreSQL instance, and obtain explicit authorization before switching live Render `DATABASE_URL`.
5. Switch only after review returns CONTINUE. A sandbox-only payment demonstration needs separate bounded authorization, and live payouts remain prohibited.

## Verdict
**BLOCK** live Neon cutover. Continue isolated preflight and security tests. No change made to Render configuration or payout permissions.
