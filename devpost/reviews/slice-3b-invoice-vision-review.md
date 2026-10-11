# Slice 3B: scanned PDF image path, advisor UI and native isolation

## Critique gate
**Step:** Restore the approved `spec.md > Invoice Analysis Pipeline` PDF/image preparation path and deliver a usable signed-in reviewer without adding payment authority.
**Decision:** **CONTINUE** to bounded hosted development validation; **BLOCK** full Slice 3 acceptance/Gate H without external provider and payment evidence.
**Score:** **8.3/10**, step quality only.
**Review independence:** self-review backed by two independent GitHub CI workers.

### Evidence checked
- `2fbbdcd9ef8a284449c6035eae3dae41afe94f8a`; GitHub Actions `38168733595` and `38168729942`: 30 files / 180 tests, PostgreSQL 16 migrations twice, seed replay, TypeScript, production Next build, signed-in HTTP smoke; no Payouts POST.
- `src/invoices/pdf-raster.ts`, `src/invoices/pdf-raster-worker.mjs`, `tests/pdf-raster.test.ts`: actual image-only PDF -> bounded PNG rendering with source/render digests and encrypted/malformed/page-bound checks.
- `src/invoices/image-analysis.ts`, `drizzle/0015_pdf_vision_render_provenance.sql`, `tests/invoice-image-analysis.test.ts`: original PDF sha, exact PNG sha and page/rasterizer version retention; single-page scanned content always ESCALATE; multi-page scan explicitly held before provider.
- `app/api/admin/invoice-artifacts/[id]/observe/route.ts`, `app/invoice-artifacts/[id]/page.tsx`, `app/invoice-artifacts/[id]/observation-actions.tsx`: Same Origin, Better Auth, live membership, explicit admin action, never agent-provided amount/receiver.
- `next.config.ts`, `src/invoices/prompts.ts`: native canvas and PDF.js are externalized; prompt file tracing restricted to two static committed paths.
- `src/invoices/pdf-text.ts`, `src/invoices/pdf-raster.ts`: no environment variables inherited by parser workers.

### Artifact scores
| Artifact | Score | Main weakness |
|---|---:|---|
| Raster worker and original document binding | 8.5 | Native allocations not fully bounded by V8 worker memory controls; no OS network isolation |
| Signed-in PDF/image review | 8.4 | Real hosted session and provider credentials unverified |
| Vision provenance + fail-closed decisions | 8.7 | Live model serving-ZDR not observed |
| Full Slice 3 acceptance | 6.3 | Multi-page scans and actual external model request not complete |

### Findings
1. **MEDIUM — Multi-page scanned PDF not observed.** Spec allows max 20 pages, but this advisory implementation intentionally rejects a multi-page scan instead of selecting an incomplete first-page payment representation. Required repair: add bounded selected-page multi-image processing or explicitly scope/verify a manual review fallback before Slice 3 sign-off.
2. **MEDIUM — Native-worker isolation is incomplete by OS standards.** Empty environment and bounds reduce exposure, but native canvas memory is outside V8 resourceLimits and Node workers may access network. Required repair for sensitive production use: process/container isolation and resource/network caps. Hackathon synthetic documents only.
3. **HIGH FOR SLICE RELEASE — Real external provider and complete payment proof unverified.** CI exercises a mocked provider and fake human portal evidence; an `EXPLABS_API_KEY` must be configured securely for actual ZDR serving proof. Gate H also requires explicit separately authorized Sandbox payout plus webhook, not synthetic fixture assertions presented as real supplier contact.
4. **MEDIUM — Hosted browser and session not yet verified.** Render later confirmed exact SHA `2fbbdcd9...` LIVE, migrations/seed, Next.js readiness and anonymous redirect/login page responses. Authenticated Render reviewer journey, provider ZDR serving response and payment execution remain unverified. Do not promote boot evidence into functional completion.

### Requirement coverage
- **VERIFIED:** bounded worker PDF raster to PNG, hash integrity and provenance, empty worker environments, native Next build, admin route denial and same-origin checks, zero-money result, deterministic migration/seed and HTTP smoke.
- **UNVERIFIED:** hosted login/user-visible UI, actual Experiential inference/ZDR, complete scanned multi-page extraction, real Sandbox invoice-derived Payouts/webhook.
- **INCORRECT:** "Slice 3 complete", "real vendor issuer verified", "live GLM privacy proven", "Sandbox invoice payment executed".

### Repair order
1. Validate exact deploy SHA in existing free Render app; run non-destructive health and anonymous auth denial checks.
2. Resolve single-page versus multi-page scan acceptance without authorizing unsourced fields; run regression suite.
3. Verify live provider ZDR and real Flash serving identity with synthetic image after authorized account key configuration.
4. Run the approved Sandbox-only 3-case proof with explicitly authorized physical Payouts call, then re-review Gate H and mark Slice 3 done only when verified.

**Next gate:** hosted dev code verification, followed by the distinct live-provider and money-movement acceptance gates. No new staging or paid database.

### Hosted deployment re-review (2026-10-11)

- **Evidence:** Render deployment `dep-db5ub9l9fdbs73e58mug` status `live`, exact code commit `2fbbdcd9ef8a284449c6035eae3dae41afe94f8a`. Render app logs contain `database migrated (16 application migrations)`, demo admin exists and Next.js ready. Provider request logs: `GET /sign-in` 200; unauthenticated `GET /` and `GET /dashboard` 307.
- **Correction to prior finding:** hosted boot and unauthenticated session boundary are now VERIFIED. Signed-in reviewer actions remain UNVERIFIED on Render; only CI smoke verified those.
- **Review decision:** CONTINUE bounded Slice 3 development. **BLOCK** Slice 3 acceptance, live model-proof claim and any unapproved Sandbox payment.
