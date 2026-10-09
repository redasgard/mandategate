# Gate H infrastructure preflight: paid isolated Postgres creation

**Step:** Provision temporary paid DB without touching the stable PayPal demo.
**Decision:** CONTINUE only to staging-service preparation. **BLOCK** any live Gate H tests/payment, release or merge.
**Review independence:** self-review with a second connected Render resource read.
**Score:** 8.8/10 for bounded provisioning; hosted-environment readiness unscored.

## Evidence checked
- User explicitly chose a temporary paid, isolated staging database.
- Render `create_postgres` returned resource `dpg-db4351rl550s73acup8g-a` and plan `basic_256mb`, 1 GB disk, PostgreSQL 18, Oregon.
- Subsequent `get_postgres` returned `available`, public `ipAllowList=[]`, disk autoscaling off.
- Existing free `mandategate-sandbox-db` and live `mandategate-web` have different resource identifiers and were not targeted by any mutation call.
- Current published Render pricing: $6/mo base Postgres compute, 1 GB included; usage prorated.

## Findings
1. **HIGH (integration gate):** No staging web application/credentials/connectivity. Connector read-only DB metadata omits connection strings. Required: configure separate staging service and internal DB connection securely, verify `current_database()` and stable DB isolation before migrations.
2. **HIGH (Gate H):** No real supplier/issuer out-of-band proof, authenticated staged reviewer, Experiential serving-route privacy evidence, or PayPal Sandbox three-case proof. Do not equate DB creation with live Gate H completion.
3. **MEDIUM:** Paid DB persists/bills until explicitly deleted. Cleanup must be performed manually in Render Dashboard after Gate H, because no connected delete action exists; confirm deletion by listing resources.
4. **MEDIUM:** Database capacity 256 MB with 1 GB storage is cost-minimal, not guaranteed adequate for every PDF/DB integration test. Measure memory/connection pressure before enlarging, and do not auto-scale storage.

## Coverage
- VERIFIED: distinct Render DB created with paid plan, subsequently reported `available`; disk cap and no public IP entries.
- UNVERIFIED: network credential isolation, schema, service, test execution, financial/provider external evidence.
- INCORRECT: claiming staging is fully deployed or connected.

## Repair order
1. Create separate web staging service only with auto-deploy off and secret-safe internal DB URL.
2. Check effective configuration and credential/data separation. Test authenticated reviewer and GLM privacy with synthetic fixtures.
3. Obtain external issuer proof and distinct PayPal Sandbox three-case evidence. Complete cleanup.

**Next gate:** CONTINUE bounded staging wiring; Gate H BLOCKED.
