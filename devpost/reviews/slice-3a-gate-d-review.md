# Gate D: Trusted Issuer Origin Attestation

## Critique gate

**Step:** Independently enrolled vendor issuer channels plus authenticated organization-admin attestation.
**Decision:** CONTINUE to isolated Gate E design and source-safe code, NOT invoice-to-payment execution or merge.
**Score:** 8.8/10
**Review independence:** self-review with GitHub Actions/PostgreSQL verification.

### Evidence checked

- drizzle/0008_vendor_origin_channels.sql: pre-enrolled vendor origin-channel registry; organization admin membership; composite organization/vendor FK; immutable enrolled source fingerprint and permanent revocation; origin attestation requires a reference to a pre-existing registry channel.
- scripts/seed.ts: seeds separate demo organization admin membership and explicitly synthetic origin channel, independently of any invoice/model.
- src/authority/origin-attestation.ts: requires active ADMIN membership, exact organization-owned artifact hash, correct active vendor channel, matching off-invoice source type and bounded external record reference. Emits human attestation with hashed reference; no payment authority.
- tests/origin-attestation.test.ts: unauthenticated actors, foreign-tenant channels, missing/mismatched references, immutable audit, exact-once attestation replay, synthetic test gating, permanent revocation.
- tests/authority-provenance.test.ts: existing Gate B provenance fixtures now require origin channel.
- GitHub Actions CI 37822386898 at commit 9d0a12fbf3ed215b9f061980a932163c483f540d: success; migrations and seed twice, 15 test files / 109 tests, TypeScript, Next build and HTTP smoke; no PayPal POST.

### Artifact scores

| Artifact | Score | Main weakness |
| --- | ---: | --- |
| Trusted vendor channel tenant scoping | 9.3 | Actual channel enrollment requires a protected admin process |
| Human attestation persistence | 9.0 | Source reference remains human-attested, not independently cryptographically confirmed |
| Synthetic fixture control | 9.3 | Intentionally test-only; hosted demo provisioning still pending |
| Role/access tests | 9.0 | CI identity only; protected admin UI route belongs to Gate F |

### Findings

1. **MEDIUM: Human report of an out-of-band check is not cryptographic issuer authenticity.**
   - Evidence: admin supplies source record reference, and service confirms enrolled channel type but does not fetch or independently validate the external callback/ERP/portal event.
   - Impact: this is an auditable human attestation, not proof supplied by the vendor; compromised admin or false reference remains a threat.
   - Required repair: Gate F must present the enrolled channel, capture reason and actual independent evidence reference, enforce authenticated actor from session and bind one frozen approval. Production may use only verified channels supported by a documented process; synthetic fixture must be visibly labeled and never mistaken for a real vendor.
   - Verification: signed-in owner/nonowner tests; untrusted invoice email/logo cannot enroll or attest origin.

2. **MEDIUM: No safe way to enroll live channels or attest through authenticated UI yet.**
   - Evidence: the only current caller is internal service, and synthetic enrollment is seeded in demonstration data.
   - Impact: it cannot establish a real origin through the user interface yet.
   - Required repair: gate F admin-only issuer workflow or a preconfigured trusted ERP/portal integration.
   - Verification: protected route actions use session-scoped user identity, organization membership and existing trusted vendor registry.

3. **LOW: Existing Gate C still lacks actual PDF-page parser bindings.**
   - Evidence: model-selected page context has no hash-derived independent source loader.
   - Impact: no source is promoted to T2 or eligible to authorize money.
   - Required repair: bounded source parser/human transcription bound to raw artifact and full negative fixture checks.
   - Verification: independent page digests and claim constraints before later Gate E release.

### Requirement coverage

- VERIFIED: explicit enrolled vendor channel distinct from invoice contents; admin membership and vendor/tenant checks; no payment authority grant; synthetic test-only gate; immutable attestations; 109 tests green.
- UNVERIFIED: actual third-party issuer identity; interactive admin attestation; live deployment; complete source corroboration.
- INCORRECT: calling a free-form evidence-reference hash real vendor authentication would overstate proof.

### Repair order

1. Continue Gate E as a guarded proposal-only internal bridge, requiring verified evidence plus an attestation.
2. Keep activation of invoice-origin ALLOW blocked until independently parsed source and protected admin attestation are integrated.
3. Gate F binds an authenticated approval to the exact tuple and trusted channel evidence.

### Next gate

CONTINUE isolated Gate E implementation. Invoice-derived payment execution remains BLOCKED; PR #2 stays draft.
