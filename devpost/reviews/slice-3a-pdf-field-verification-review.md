# Slice 3A Gate C3: PDF Parser-Backed Field Verification

## Critique gate
**Step:** Convert explicitly reviewed PDF facts to T2 SOURCE_CORROBORATED claims only when independently parsed page evidence matches each exact semantic field.
**Decision:** CONTINUE to isolated source/issuer and reviewer integration tests. Invoice-to-PayPal release remains BLOCKED.
**Score:** 8.8/10 for isolated T2 verification.
**Review independence:** self-review using GitHub Actions, PostgreSQL constraints and actual PDF regression fixtures.

### Evidence checked
- Code commit `96931eff6717ebaab81cc3c3d19bde26a43dc943`, GitHub Actions run `37845500331`, SUCCESS: migration/seed idempotence, frozen pnpm install, TypeScript, 19 test files / 143 tests, production build, smoke.
- `src/authority/pdf-field-verification.ts`: verifies immutable raw PDF artifact hash, active organization admin identity, exact stored page-text SHA-256 records, source quote and field semantic agreement both per page and across the entire PDF, and emits an actor/reason-bound immutable claim.
- `drizzle/0013_pdf_field_lineage.sql`: T2 PDF_TEXT claims require parser-page identity and text SHA-256; composite FK ties field evidence to immutable `invoice_pdf_source_pages`. Unique verified PDF claim snapshots prohibit identical review replay.
- `src/authority/payment-proposal.ts` and `src/authority/binding-guard.ts`: require parser-page digests for T2 PDF_TEXT claims at proposal and approval/execution revalidation, without changing the direct Slice 2 `agent_api` PayPal path.
- `app/api/admin/invoice-artifacts/[id]/verify-pdf-facts/route.ts`: authenticated admin-only, same-origin, streamed-size-capped JSON review; no PayPal or payment request write.
- `tests/pdf-field-verification.test.ts`: real two-page parsed PDF positive source, malicious amount and receiver, false quote, page swap, second-page conflicting total, cross-tenant/unauthenticated actor, wrong artifact digest, duplicate review, FK and append-only enforcement, and missing issuer-origin negative payment proposal.

### Artifact scores
| Artifact | Score | Main weakness |
|---|---:|---|
| Per-page and cross-document typed field verification | 9.0 | Narrow strict English/format patterns intentionally escalate unsupported invoices |
| T2 proof persistence and composite FK | 9.3 | Database/app-controlled evidence is not external issuer signature |
| Authenticated review endpoint | 8.6 | Route identity and human input not yet exercised in a hosted reviewer session |
| Payment sink provenance guards | 8.9 | Full live invoice-to-PayPal replay/race integration remains untested |
| Negative fixture suite | 9.0 | Model observations and visual PDF presentation are not yet composed end to end |

### Findings
1. **MEDIUM — Human-review identity and source signing not yet proven live.**
   - Evidence: tests use seeded Better Auth admin identity and direct service calls, not an actual deployed review session.
   - Impact: browser security, UI source display, organizational review procedures, and external sender-channel proof are still integration prerequisites.
   - Required repair: run signed-in owner/outsider, stale digest, reason capture and source-page review against the same deployed staging code.
   - Verification: operator-verified staging trace with exact user ID and immutable action reference.
2. **MEDIUM — Extracted PDF text does not prove rendered visual appearance or supplier identity.**
   - Evidence: source text is parsed from PDF bytes and validated against its own labels, while OCR, occlusion/layering and out-of-band supplier verification are separate.
   - Impact: T2 establishes page-text semantics only, not that the PDF is genuine or that a model visual observation reflects a visible layer.
   - Required repair: preserve T3 issuer attestation as mandatory, test visual/source disagreement and refuse ambiguous layouts.
   - Verification: malicious overlay/scanned-PDF negative controls and external contact/ERP fixture evidence.
3. **MEDIUM — Payment integration remains blocked by missing real end-to-end evidence.**
   - Evidence: test verifies zero payment rows and missing T3 yields ESCALATE; no invoice-derived Payouts POST was performed.
   - Impact: Gate H three-case proof, actual model ZDR, and live reviewer/principal/Render cutover are unverified.
   - Required repair: complete isolated staging and adversarial GLM/PDF-to-PayPal proof, then repeat full review.
   - Verification: one synthetic ALLOW payout, zero payout POSTs for ESCALATE/DENY, webhook consistency and source-to-sink trace.

### Requirement coverage
- VERIFIED: parser-derived text bound to exact stored artifact, page SHA and source quote; explicit admin role; T2 immutable claim; issuer separately required; payment denied without T3; 143 CI tests passed.
- UNVERIFIED: live reviewer session and external issuer authentication, model/visual composition, Render worker deployment, Experiential ZDR/no-training policy, full PayPal Sandbox invoice-derived payout.
- INCORRECT: calling T2 PDF field verification proof of issuer legitimacy or payment authorization.

### Repair order
1. Integrate and test the complete authenticated reviewer + origin attestation workflow on isolated staging, including exact PDF source preview and stale/revoked states.
2. Validate source-to-sink adversarial GLM observations against actual parsed PDF and separate legitimate/malicious sources.
3. Establish distinct Render principals, Experiential privacy, one bounded Sandbox ALLOW and zero-post controls; run Gate H release review.

### Next gate
CONTINUE to isolated integration. **BLOCK** PR #2 merge and all invoice-derived payment execution pending Gate H live preflight.
