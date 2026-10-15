# MandateGate Render / Neon rollback gate
Date: 2026-10-14 (Pacific)
Status: **NOT AUTHORIZED FOR LIVE CUTOVER**
Review independence: self-review

## Verified current production baseline
- Render service: `srv-db39vmm7bikc73c55nh0` (`mandategate-web`)
- URL: https://mandategate-web.onrender.com
- Branch: `build/slice-3-invoice-intake`
- Most recent observed live commit: `5fad7c57b265f208cbac1f401f5668e6e102bc23`
- Deploy: `dep-db84cmuk1f9s73e4io30`
- Auto-deploy: `yes`, checksPass
- Build: `pnpm install --frozen-lockfile && pnpm build`
- Startup: `pnpm db:migrate && pnpm demo:seed && pnpm start`
- Existing Render PostgreSQL remains the original historical source. Keep it intact.
- Do NOT store original DATABASE_URL values in Git or this document.

## Evidence so far
- Isolated Neon preview workflow run https://github.com/redasgard/mandategate/actions/runs/38684966637 : build, fail-closed preview startup, HTTP login/dashboard, disabled PayPal webhook, and zero payment executions all PASS.
- Those checks run in ephemeral GitHub Actions on the `repair/neon-isolated-preview` branch; no persistent Render preview service has been validated.
- No PayPal API credentials were supplied to the isolated preview job.

## Rollback procedure (not yet tested on a live Render service)
1. Preserve the original Render service ID, the currently live deployment ID and SHA above, *and* its existing database URL in Render's secret settings; never paste secret values into logs/chat/source.
2. Before any change, disable Render auto-deploy and record configuration; do not use `pnpm db:migrate && pnpm demo:seed && pnpm start` for a Neon preview.
3. Use a **separate** preview service and the `repair/neon-isolated-preview` branch, explicit `MANDATEGATE_DISABLE_PAYMENTS=1`, **no PayPal credentials**, `DATABASE_URL` pointed only to Neon, and start command `pnpm exec tsx scripts/neon-preview-start.ts`. Avoid seed, migrations and webhook recovery.
4. To roll back a preview failure: stop/remove the preview service, revoke its Neon credentials, verify zero Neon payment executions. The existing Render web service requires **no changes** in this phase.
5. A future live switch requires an independently tested reverse migration of runtime configuration. Before authorizing it, preserve and verify the original Render database connection, deployment SHA, build/start commands, env variable set, and redeploy process. Confirm successful old-database health and HTTP login after restore. Database writes cannot be undone by switching URLs, so freeze writes during a switch.
6. Never reenable PayPal submission in preview mode. Any real or sandbox payout requires a separate exact approval.

## Blocking findings / next gate
- **BLOCK:** A deployed persistent isolated Render preview with Neon secret injection has not been tested.
- **BLOCK:** No end-to-end rollback of a modified Render service has been performed.
- **BLOCK:** No verified backout / stop mechanism is exposed in the available Render connector interface; do not create a permanent billable preview service without a cleanup path.
- **BLOCK:** Startup migration + seed mutation in the existing live Render service must be removed from the Neon cutover path.
- **BLOCK:** Real payment integration isolation and multi-tenant access not fully audited.

Decision: **Continue isolated preflight only. Do not change live Render DATABASE_URL.**
