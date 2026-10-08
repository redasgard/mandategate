# Slice 3 Admission / Storage Checkpoint Review

## Critique gate

**Step:** Slice 3 initial secure artifact intake and strict extraction-contract foundation
**Decision:** CONTINUE (to parsing and model integration only)
**Score:** 8.7/10
**Review independence:** self-review, supplemented by deterministic GitHub Actions verification

### Evidence checked

- Slice 2 merged into main: PR #1, merge commit afab57dc9fca4c87f4f26eee4669e977c6eadbfa.
- Isolated Slice 3 branch build/slice-3-invoice-intake and draft PR #2.
- src/artifacts/admission.ts: bounded streamed uploads, 10 MiB limit, MIME/magic checks, and image dimensions.
- drizzle/0003_invoice_artifacts.sql: tenant-scoped bytea with hash/size checks and immutable-content trigger.
- src/artifacts/postgres-store.ts: serialized org quota, deduplication, metadata-only access, integrity-checked internal retrieval.
- src/invoices/schema.ts and normalize.ts: strict untrusted typed fields, evidence checks, decimal/date normalization.
- GitHub Actions run 37726857849 on commit 49fa88fc21f050f8f4b8e0b7edf8fac6bb144abc: migration/seed idempotence, typecheck, tests, build, and smoke passed.
- Interim migration SQL syntax failure was detected and corrected before this verified run.

### Artifact scores

| Artifact | Score | Main weakness |
|---|---:|---|
| Stream-bounded admission | 9.1 | Header/magic checks are not full document parsing |
| Immutable tenant-scoped store | 9.3 | Storage quotas do not replace rate limiting |
| Untrusted extraction schema | 8.5 | No actual model or parsed-document integration |
| Test and CI evidence | 9.2 | Real document/vision and live AI tests pending |
| Payment authority separation | 9.5 | No payout authority assigned to document or model |

### Findings

1. **MEDIUM - Full document validity and resource-bounded decoding remain incomplete**
   - Evidence: admitted content remains explicitly STORED_UNTRUSTED. No PDF.js page parser or actual image decoder yet.
   - Impact: cannot claim a parsed invoice or send bytes to a model based on magic checks.
   - Required repair: bounded PDF.js parsing, 20-page cap, encrypted/corrupt document rejection, bounded rasterization and image decoding.
   - Verification: real and adversarial document fixture tests.

2. **MEDIUM - Privacy and model-route assurance not yet connected**
   - Evidence: no Experiential account policy preflight, compliant GLM extraction, JSON-schema response validation, or ZDR response verification yet.
   - Impact: document processing must not send sensitive content upstream; full Slice 3 remains blocked.
   - Required repair: fail-closed capture/ZDR/no-training policy, capability preflight, strict GLM response schema, and response metadata checks.
   - Verification: mock denied/unsupported cases and a compliant live synthetic invoice.

3. **LOW - Upload request rate limits remain deferred**
   - Evidence: size and organization quota exist; no per-principal time-window limiter.
   - Impact: repeated authenticated invalid upload attempts may still consume request capacity.
   - Required repair: throttle at the agent-ingress layer before broad public launch.
   - Verification: excess requests reject without changing artifacts.

### Requirement coverage

- **VERIFIED for this checkpoint:** bounded upload, MIME/magic checks, tenant isolation, content-addressed deduplication, bytea/SHA-256, immutable bytes, organization quota, metadata-only reads, strict typed assessment, CI.
- **UNVERIFIED for full Slice 3:** robust PDF/image parse, page hashes, Experiential ZDR, actual GLM, async analysis, canonical request handoff, live extraction, hostile fixture suite.
- **INCORRECT:** none remaining in the reviewed admission-storage scope.

### Repair order

1. Add the bounded PDF/image parser and page-level provenance.
2. Add the privacy-verified Experiential model gateway.
3. Add durable async analysis and guarded handoff into the existing deterministic kernel.
4. Run adversarial and real fixture tests, followed by the complete Slice 3 review.

### Next gate

**CONTINUE** development from the admission checkpoint. This decision does not complete Slice 3, authorize unverified model processing, or permit merging draft PR #2.
