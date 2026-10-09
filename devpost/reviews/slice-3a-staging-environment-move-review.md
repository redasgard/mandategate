# Gate H Render project move and staging bootstrap hardening

**Decision:** CONTINUE the **isolated code** branch; **BLOCK** the live hosted-review / GLM / payout integration until Render build and independent staging secrets work.
**Self-review score:** 8.7/10 for fail-closed DB code; hosted rollout remains BLOCKED.
**Review independence:** self-review + CI tests, plus independently observed Render service and database metadata.

## Evidence checked
- Render `get_service` staging web ID `srv-db4367u0tbcc73cugar0` and `get_postgres` paid DB ID `dpg-db4351rl550s73acup8g-a` both return `environmentId=evm-db43agks728c739d60r0`. The stable service had a different environment ID.
- Render failed deploy `dep-db436bks728c739co9pg`, source commit `05f216df1c3a80169baf02557d3c17add9455528`, failed before application build. Logs show `corepack enable` attempting to unlink `/usr/bin/pnpm` on a read-only filesystem (`EROFS`).
- User reported assigning the new internal PostgreSQL URL to the staging variable `DATABASE_URL`. The connector does not expose env values, and no live DB query or schema migration is verified.
- `src/staging/database-guard.ts`, `scripts/migrate.ts`, `scripts/seed.ts`, `scripts/render-start.ts`: explicit target, source, and DB session preconditions before DDL/seed/recovery.
- `tests/staging-database-guard.test.ts`: stage flag, wrong target, missing secrets, distinct keys and mocked DB query negatives. GitHub Actions `37865450679` SUCCESS (25 files / 164 tests); follow-up missing-stage-flag guard GitHub Actions `37865631906` and `37865628351` both SUCCESS.

## Findings
1. **HIGH (environment):** Staging cannot build with the current Render command. Repair in Render Settings to run Corepack pnpm directly without `enable`; repeat only a bounded staging build.
2. **HIGH (environment):** Exact environment secret values and live database connection are inaccessible to this tool. Must confirm uppercase `DATABASE_URL`, independent Better Auth and two principal keys, and successful current-database verification in Render startup log.
3. **MEDIUM:** Fixed database resource identity in source is purposefully staging-specific. Must be updated before recreating the paid database; no automatic fallback is allowed.
4. **MEDIUM:** Code checks credential presence and separation between invoice/payment principals but cannot prove the keys differ from stable environment. Human must verify separately in Render.
5. **HIGH (Gate H):** No actual out-of-band issuer, signed-in staged reviewer, GLM ZDR serving response, or PayPal Sandbox payout evidence. Preserve release BLOCK.

## Requirement coverage
- VERIFIED: web+database shared staging environment ID; build root cause from Render log; isolated database guard code tests and original 164 CI checks.
- UNVERIFIED: effective DATABASE_URL value, actual DB connection, secret uniqueness, stage startup and Gate H external evidence.
- INCORRECT: claiming the user configuration already resulted in a working web application or authenticated integration.

## Repair order
1. Correct existing staging Build Command in Render UI, without touching stable or creating another resource.
2. Finish independent staging env secrets; keep live-proof flags OFF.
3. Deploy exact CI-green branch; observe read-only current_database proof preceding migrations and seed. Test signed-in reviewer, then controlled GLM and PayPal separately.

**Next gate:** BLOCK hosted execution; continue only once manual Render configuration is verified.
