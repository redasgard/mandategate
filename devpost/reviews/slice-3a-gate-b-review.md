# Slice 3A Gate B: Immutable Provenance Schema and Contracts Review

## Critique gate

**Step:** Gate B, immutable tenant-bound evidence, source attestations, proposed payment binding and field lineage schemas.
**Decision:** CONTINUE to Gate C (independent source verification) on draft PR #2, not to any invoice-derived payment action.
**Score:** 8.8/10
**Review independence:** self-review with independent GitHub Actions/PostgreSQL deterministic tests.

### Evidence checked

- drizzle/0007_authority_provenance.sql defines claim snapshots, claim field evidence, issuer attestations, proposed authority bindings and append-only parameter-lineage events.
- Exact artifact content hash and same-organization composite FKs enforce source identity across claim, attestation, vendor, destination, policy, binding and trace; immutable triggers prevent UPDATE/DELETE for claim sets, field sources, attestations and lineage.
- Proposed payment tuple fields cannot be modified/deleted. Status transitions cannot regress; approval and terminal fields are frozen after state change.
- src/authority/contracts.ts provides strict Zod schemas and length-prefixed canonical SHA-256 digests for claims and payment tuples. A digest is explicitly a change detector, NOT a signature or mandate.
- tests/authority-provenance.test.ts and tests/authority-contracts.test.ts: synthetic transactions rolled back after use, cross-tenant forged references, wrong artifact hashes, missing proof, tuple tampering, forbidden mutations and duplicate trace positions.
- GitHub Actions CI run 37813228504 at code commit c708e2a84b175add8dd0bf2a71e944c4a634237c: SUCCESS. Eight SQL application migrations executed twice, seed twice, typecheck, 14 test files / 93 tests, production build and agent HTTP smoke.
- An intermediate FK index omission was repaired in f8cf7d0. An intermediate negative test hit uniqueness before tenant FK; corrected in c708e2a. A null sentinel hash collision was avoided by encoding null presence separately in 0cf02b3.

### Artifact scores

| Artifact | Score | Main weakness |
| --- | ---: | --- |
| Composite source and tenant identity constraints | 9.1 | Only the database writer is trusted; issuer verification is not implemented |
| Append-only and tuple immutability | 9.2 | Actual cryptographic sealing/checkpointing remains later |
| Typed canonical hashing | 9.0 | Hash identity alone is not authorization |
| Negative adversarial database tests | 9.1 | Cannot prove real source issuer or malicious model resistance |
| Release readiness | 7.3 | Entire invoice-derived payment path still absent |

### Findings

1. **MEDIUM - Database proof strings are not independent attestation**
   - Evidence: the tables allow VERIFIED or AUTHORIZED rows carrying an actor and proof hash but have no external signature/issuer validation. There is no application endpoint capable of minting these rows yet.
   - Impact: future code must NOT treat a row with status VERIFIED, a tuple digest or even a method string as independently trusted evidence.
   - Required repair: Gate C/D must implement independent source semantic validation and authenticated/out-of-band issuer verification, with verifiable evidence; Gate E must validate actor, source, currency, policy versions and current binding status before payment.
   - Verification: forged attestation/claim proof strings cannot trigger ALLOW in end-to-end negative tests. Synthetic fixture attestation must be visibly demo-only.

2. **MEDIUM - No source-to-claim writer or human reviewer has been authorized yet**
   - Evidence: Gate B consists of schema, contracts and database tests; no product runtime route writes or uses authority bindings.
   - Impact: the actual evidence promotion path is still unbuilt.
   - Required repair: Gate C adds deterministic source/field checks, Gate D implements authorized issuer attestation, Gate E the internal-only bridge.
   - Verification: only code with verified authority can append higher-tier records; model-only writes stay UNVERIFIED and cannot reach payment submission.

3. **LOW - Deploy and operational storage lifecycle pending**
   - Evidence: database schema was exercised on CI PostgreSQL only, not on stable Render.
   - Impact: the real demo must be rehearsed after providing a separate privileged payment key, and any required retention/revocation policy must be documented.
   - Required repair: controlled deployment after Gate C-G acceptance; preserve zero change to current live Sandbox until safe.

### Requirement coverage

- VERIFIED IN CI: 8 migrations twice, 93 tests, exact artifact+org FK identity, immutable source records, immutable bound tuple, trust-tier-labeled lineage, duplicate sequence/tenant/hash rejection, full application regression and CI smoke.
- UNVERIFIED: independent extraction facts, supplier authenticity, bound human authorization, live provider processing, authorized PayPal path, Render deployment.
- INCORRECT: database row status or digest alone must not be represented as permission to pay.

### Repair order

1. Continue Gate C with deterministic source/value semantic verification; keep images untrusted.
2. Gate D requires genuinely independent issuer proof, not a user/model-supplied string.
3. Gate E must enforce signed/current authorization and revalidate directly at the existing executor; Gate G adversarial probes before any payment connection.

### Next gate

CONTINUE only to Gate C on draft PR #2. Separate BLOCK on invoice-to-payment integration remains.
