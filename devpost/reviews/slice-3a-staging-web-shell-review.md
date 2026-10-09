# Gate H staging web creation preflight

**Decision:** CONTINUE only to secure secret wiring; **BLOCK** manual deploy until DB target/independent key isolation established, and BLOCK all PayPal/GLM live tests until their own evidence gates pass.
**Score:** 8.8/10 for separated resource provisioning. Actual hosted-session readiness UNVERIFIED.
**Review independence:** self-review; a second Render service-list observation corroborated creation.

## Evidence checked
- Render web service `srv-db4367u0tbcc73cugar0`, name `mandategate-gate-h-staging`, free plan, Oregon, code branch `build/slice-3-invoice-intake`, `autoDeploy=no`, staging URL `https://mandategate-gate-h-staging.onrender.com`.
- Explicit separate database ID `dpg-db4351rl550s73acup8g-a`, paid `basic_256mb` reported `available`; old free DB has different ID.
- Staging-specific nonsecret env flags installed. GLM adversarial inference disabled and isolated database confirmation deliberately false; no PayPal one-time grant was set.
- Connected Render `list_deploys` yielded no deployment records following service creation; no manual deploy was triggered. Service startup code requires credential variables that are not supplied.
- Prior verified GitHub Actions Gate H harness CI `37856559061` (160 tests).

## Findings and repair order
1. **HIGH (environment):** `DATABASE_URL`, `BETTER_AUTH_SECRET`, admin and principal credentials not configured. Connector exposes no DB internal URI/password. Complete in Render dashboard without copying secrets into chat or stable service; before migration prove `current_database()=mandategate_gate_h_staging_db`.
2. **HIGH (scope):** Initial staging code launch must not run until data/secret isolation verified; live GLM and payout flags remain disabled.
3. **HIGH (release):** Authentic issuer proof, signed-in user review, Experiential serving request/ZDR, and actual PayPal Sandbox payouts not yet run. Keep Gate H BLOCKED.
4. **MEDIUM (cost):** Paid DB remains billable until deleted in Dashboard. Cleanup after Gate H or abandonment; verify removed.

**Next gate:** Manual secure binding + staging deployment verification. No authorization to use live issuer or move money is conferred by resource creation.
