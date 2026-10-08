# Slice 3A Gate A: Machine Privilege Separation Critical Review

## Critique gate

**Step:** Gate A, separate invoice-observer credentials/scopes from trusted direct payment submission, migrate demo identities.
**Decision:** CONTINUE to Gate B on the isolated draft branch. NOT authorization for deployment or invoice-to-payment integration.
**Score:** 9.1/10 (implementation checkpoint)
**Review independence:** self-review, supplemented by direct GitHub source and PostgreSQL/HTTP CI evidence.

### Evidence checked

- Payment-request POST now requires payment:submit, not retired invoice:submit.
- Invoice artifact upload, analysis and metadata GET routes require invoice:upload, invoice:analyze and invoice:read respectively.
- src/auth/principal-scopes.ts and src/auth/machine.ts reject unknown, legacy and mixed roles.
- drizzle/0006_disjoint_machine_scopes.sql adds an idempotent database CHECK constraint against mixed invoice/payment role scopes.
- src/auth/principal-provisioning.ts and scripts/seed.ts atomically migrate the existing legacy demo principal into an invoice-only principal and provision a separately keyed trusted payment principal, failing early for missing/equal secrets.
- scripts/smoke.ts and tests/principal-provisioning.test.ts cover cross-role HTTP access refusal, synthetic old key invalidation, seed reruns, mixed-role DB rejection, cross-org principal isolation and trusted direct ALLOW/ESCALATE/DENY.
- GitHub Actions run 37811225079 at code commit c870270959facafc8f209e4a14f3dbb4bc806b77: success. Migrations twice, seeding twice, TypeScript, 12 test files / 79 tests, production build, HTTP smoke and zero payout execution.
- Earlier red intermediate runs exposed non-idempotent constraint migration (fixed in 6dbcfc4) and Vitest path alias resolution (fixed in c870270).
- Render still runs approved Slice 2 code. No Gate A production/Sandbox migration executed.

### Artifact scores

| Artifact | Score | Main weakness |
| --- | ---: | --- |
| HTTP route permissions | 9.4 | No invoice-origin authority bridge, correctly deferred |
| Database role constraint | 9.2 | Mixed roles are blocked; exact scope allowlist is enforced in auth code |
| Demo seed / principal migration | 9.1 | Requires controlled live cutover |
| Secrets and role isolation | 9.0 | New privileged key not yet proven in Render |
| CI smoke / regression | 9.3 | CI only, not live deployment |

### Findings

1. MEDIUM: Actual Render key migration/cutover is unverified.
   - Evidence: only CI synthetic DEMO_PAYMENT_AGENT_API_KEY has been configured; the stable Render deployment has not moved to this draft branch.
   - Impact: deploying without the new key fails seed startup; a live shared DB cutover may briefly deny the old application's former payment route.
   - Required repair: configure separate privileged secret through Render secret management before deployment. Use a controlled cutover and check old invoice key denied payment, new privileged key accepted and no dual-role scope.
   - Verification: live HTTP scope matrix, PostgreSQL role contents, no accidental PayPal POST.

2. LOW: Existing trusted direct-payment service remains without invoice provenance binding.
   - Evidence: the earlier direct agent_api helper is preserved to keep verified Slice 2 behavior.
   - Impact: future invoice-derived workflows must not simply call it with model-origin values.
   - Required repair: Gate B-E must introduce independent evidence, issuer attestation and an internal verification bridge; invoice-to-payment remains blocked.
   - Verification: negative source-to-sink tests and exact approval binding during later gates.

### Requirement coverage

- VERIFIED IN CI: disjoint machine scopes, migrated legacy seeded identity, refused previous synthetic key, denied invoice credential at payment POST, denied payment credential at invoice routes, distinct trusted payment principal, seed/migrate idempotence, 79 tests, positive ALLOW/ESCALATE/DENY decision smoke without PayPal POST.
- UNVERIFIED: Render secret provisioning and live cutover; invoice-to-payment provenance enforcement (later gates).
- INCORRECT: this gate does not prove the entire Slice 3 safe or deployed.

### Repair order

1. Continue isolated Gate B implementation with immutable evidence schemas and tests.
2. Before any actual deploy, provision privileged payment secret and verify old/new authorization through a controlled cutover.
3. Implement semantic validation, attestation, bound approvals, and actual adversarial tests before any invoice-derived money movement.

### Next gate

CONTINUE to Gate B code on draft PR #2 only; retain BLOCK on invoice-to-payment integration and no merge/deploy authorization.
