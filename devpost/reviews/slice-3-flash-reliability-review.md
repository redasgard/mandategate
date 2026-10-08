# Slice 3 Flash Vision Reliability Review

## Critique gate

**Step:** GLM-5.3 Flash-only observation, versioned prompt skills, durable job fencing, structural image validation
**Decision:** CONTINUE (development checkpoint only, not Slice 3 release or merge)
**Score:** 9.0/10
**Review independence:** self-review, supported by GitHub Actions deterministic tests and Postgres integration tests

### Evidence checked

- Exact model pinned to glm-5.3-flash in src/ai/gateway/experiential-vision.ts; regular glm-5.3 is not a fallback.
- Runtime-loaded versioned skills in skills/mandategate-invoice-observer/ and skills/mandategate-invoice-evidence/ with SHA-256 prompt/version stamping. The image is an untrusted observation, not an instruction source.
- Experiential privacy preflight checks org ZDR/no-training/prompt capture and Flash route support before any bytes leave. On response, require ZDR and served-model proof and strict JSON schema.
- src/invoices/schema.ts performs strict Zod validation, reason-code escalation, decimal handling without floating-point, field-level visual evidence claims, and suspected document-instruction reporting.
- drizzle/0004_invoice_vision.sql plus drizzle/0005_invoice_vision_claims.sql; src/invoices/image-analysis.ts fences UUID claims, reclaims stale claims after 90 seconds, limits attempts to three, persists advisory evidence without invoking payment execution.
- src/invoices/image-integrity.ts verifies PNG CRC/order and bounded decompression, structurally validates JPEG markers, and rejects malformed or truncated inputs before model access.
- GitHub Actions run 37732011144 on commit cf6f8faf7dc58290af08496d256c0926d0420966: migrations and seed twice, typecheck, 11 Vitest files / 72 tests, production build, and smoke all passed.
- Database-backed tests exercise tenant isolation, fail-closed privacy, concurrency, stale-claim recovery, attempt caps, one observation, and no payment authorization.
- The malformed original fixture was correctly rejected by the stronger PNG CRC gate and replaced with a checksum-correct 1x1 PNG and a reproducible valid JPEG. Do not count failed intermediate CI as final success.

### Artifact scores

| Artifact | Score | Main weakness |
|---|---:|---|
| Exact model and fail-closed provider gateway | 9.1 | Real org/provider serving behavior not verified |
| Skills, prompt examples, strict output and Zod | 9.3 | Live vision accuracy not measured |
| Tenant-scoped observations and claim leases | 9.2 | Recovery occurs on next request, not scheduled worker |
| PNG structural validation | 9.0 | Full third-party decoder not used |
| JPEG structural validation | 8.2 | Entropy stream not fully decoded |
| Deterministic CI/test quality | 9.3 | Live model and PDF integration still outstanding |

### Findings

1. **MEDIUM - No live compliant serving-route confirmation**
   - Evidence: Experiential requests and control endpoints are mocked in CI; no authenticated live EXPLABS_API_KEY/ZDR Flash route proof yet.
   - Impact: real provider routing may reject this exact schema, selected model, or organization policy.
   - Required repair: verify account-wide ZDR and no-training with capture disabled, then run a single synthetic invoice and inspect the actual Flash/ZDR/provider/request-id evidence.
   - Verification: live strict JSON response passes schema with full routing proof and nothing transmits if controls are disabled.

2. **MEDIUM - Full Slice 3 document processing is not implemented**
   - Evidence: current vision entrypoint is JPEG/PNG only; PDF.js text parsing, scanned-PDF rasterization, 20-page cap, and document-to-canonical-authority handoff remain separate work.
   - Impact: the original Slice 3 acceptance target is not yet met.
   - Required repair: finish bounded PDF preparation, OCR/vision source provenance, durable async execution, and deterministic policy-kernel handoff.
   - Verification: normal/scanned/password-protected/malformed documents, provenance checks, and human or independent evidence validation before ALLOW.

3. **LOW - JPEG validation is structural rather than a complete entropy decode**
   - Evidence: src/invoices/image-integrity.ts scans JPEG SOF/SOS/EOI markers but explicitly does not fully decode entropy or validate EXIF rotation.
   - Impact: a crafted JPEG could be structurally accepted but fail in a downstream image decoder or provider.
   - Required repair: add actual resource-bounded JPEG decoding and corrupt scan fixtures before broad external onboarding.
   - Verification: malformed entropy and decompression paths fail before model transmission.

4. **LOW - Recovery and throttling need eventual background orchestration**
   - Evidence: PENDING claim leases are reclaimable on subsequent request, but there is no periodic worker or machine-principal request-rate limiter in Slice 3 yet.
   - Impact: stalled work may require a retry trigger; abusive repeated requests can consume preflight bandwidth.
   - Required repair: move analysis and lease recovery to a bounded background worker, and add principal rate limits.
   - Verification: crash/reclaim/timeout and rate-limit integration tests.

### Requirement coverage

- **VERIFIED (checkpoint):** exactly glm-5.3-flash requested for image input; no text-only fallback; versioned runtime prompt skills; no model-side payment authority; strict output/Zod; mocked ZDR and no-training refusal; response-route identity checks; tenant-scoped audit records; lease fencing; concurrency safety; valid/corrupt structural PNG/JPEG tests; 72 tests green.
- **SUPPORTED:** Experiential public catalog documents Flash image inputs; actual model/provider route not exercised in live environment.
- **UNVERIFIED:** actual provider no-training posture; real strict Flash vision extraction; synthetic accuracy; real PDF/scanned invoice handling; full JPEG entropy decoding; independently verified image text; end-to-end canonical request submission.
- **INCORRECT:** declaring the entire Slice 3 complete or production safe would not follow from these tests.

### Repair order

1. Prove a compliant Experiential Flash model route using synthetic non-customer input. Account privacy posture must be verified before bytes leave.
2. Add resource-bounded, actual image decoding for JPEG and scanned-PDF raster preparation plus hostile fixtures.
3. Wire durable asynchronous processing and independent provenance validation before the deterministic kernel.
4. Run the complete Slice 3 adversarial acceptance suite and release critical review before marking complete or merging PR #2.

### Next gate

**CONTINUE** bounded development on draft PR #2; never deploy incomplete Slice 3 over the stable PayPal Sandbox service. Full Slice 3 remains unchecked.
