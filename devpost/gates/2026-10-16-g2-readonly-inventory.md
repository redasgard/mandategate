# Gate H / G2 Source Readiness Snapshot (2026-10-16, read-only)

**Classification:** OBSERVED database inventory, NOT payment-release approval or proof of an authenticated vendor.
**Source:** Neon project `floral-hill-01811323`, branch `br-blue-paper-arr35som`, database `neondb`, organization `org_demo`; SELECT-only introspection. The exact new count query in `src/gate-h/readiness-inventory.ts` was reconstructed and executed through Neon as a read-only query with organization ID fixed to `org_demo`.
**Application base:** development branch `build/slice-3-invoice-intake` commit `320531a7e986ea3127a6685e668401d2d5055cab`. Render web deployment `dep-db97u4m0tbcc73cg7nig` was LIVE at that commit at check time. Source inventory PR remains isolated and unmerged.

## Grounded counts

| Evidence tier or storage record | Observed count | Interpretation |
| --- | ---: | --- |
| T0 invoice artifacts | 4 | Stored PDFs exist; original document alone has no authority |
| Independent PDF source pages | 0 | No parser-produced stored page evidence available for T2 |
| Artifacts with independent source pages | 0 | Same gap applies to all currently stored PDFs |
| T2 VERIFIED PDF_TEXT claim sets | 0 | No T2 source verification recorded |
| Active, non-synthetic enrolled issuer channels | 0 | Existing active demo channel is SYNTHETIC_FIXTURE only |
| Eligible pre-existing non-synthetic channel × invoice pair | 0 | No current invoice can use a real pre-enrolled channel for T3 |
| Current non-synthetic human issuer attestations | 0 | No current T3 origin evidence |
| T4 AUTHORIZED bindings | 0 | No invoice-derived authority approved |
| Persisted consented synthetic GLM ESCALATE observations | 3 | T1 advisory observations only; no full-ZDR claim |
| Invoice-derived payment requests | 0 | No invoice-linked PayPal request |
| All demo-org payment executions | 0 | Historical Slice 2 PayPal proof belongs to another environment, not these rows |

The new non-synthetic pre-existing channel check is more restrictive than a naive `active=true` count. The latter had counted one synthetic fixture channel. A channel enrolled after an invoice cannot retroactively satisfy the code's `channel.created_at < artifact.created_at` rule. Never label the existing four PDFs independently issuer authenticated.

## Code path and exact remaining obstacles

1. **Independent parser:** `src/invoices/pdf-source-store.ts` exposes `prepareStoredPdfSourcePages`, and signed-in `/invoice-artifacts/:id` exposes **Parse original stored PDF (no AI inference)**. No parser pages have been saved in the live demo; code existence is not hosted execution evidence. This step reads original bytes and writes parser-source records only, never sends money or uses GLM.
2. **T2 verification:** `src/authority/pdf-field-verification.ts` can compare all five payment-critical fields against parsed PDF text after explicit authorized admin review. Since page count is zero, no legitimate T2 claim is currently available.
3. **T3 issuer:** `src/authority/origin-attestation.ts` requires a channel that predates the invoice and a genuine independent callback/portal/ERP evidence reference. The only enrolled channel is synthetic, and it may not become production-like financial authority. A new **genuine** channel would need actual external verification and enrollment before any new invoice is received; the operator must not forge such an event.
4. **T4 exact binding:** `src/authority/payment-proposal.ts` requires verified facts and current trusted issuer plus registry destination and policy checks; `src/authority/admin-review.ts` requires separate exact-tuple human approval. Counts are zero and the proposal path is not a source of authority itself.
5. **Strict AI and payment:** Signed-in privacy preflight previously reported `EXPERIENTIAL_ACCOUNT_ZDR_REQUIRED`. Full provider ZDR remains blocked (owner reports Pro-only entitlement); the fictional-only consented T1 route does not pass the protected `gate-h:sandbox submit` guard. A new exact USD 1.01 Sandbox payout would require a separate owner grant AFTER all independent gates and negative tests, not this read-only command.

## Repeatable non-mutating inventory

Run in a configured environment with a read-only or appropriately scoped PostgreSQL connection:

```sh
GATE_H_ORGANIZATION_ID=org_demo pnpm gate-h:inventory
```

This command performs a single organization-scoped SELECT query, prints counts, status `BLOCKED`, and explicit caveats. It does NOT invoke GLM, PayPal, issuer integrations or a mutation. It is NOT the existing potentially money-moving `pnpm gate-h:sandbox submit` command. Even if all row counts become nonzero, the inventory remains BLOCKED pending independent external provider, finance and security acceptance.

## Recommended order for the next bounded implementation cycle

1. Validate this inventory through CI and repeat the SELECT against connected Neon; stop on a query mismatch. No live mutation, no payout.
2. Safely exercise the PDF parser on an isolated fictional fixture in CI, then prepare an owner-authorized admin-only hosted source-page preparation as a separate controlled step. Do not backfill source text from the model.
3. Add hosted negative case demonstrations for suspicious historical import and substituted destination, both with zero payment side effects.
4. At G0/H0, establish actual engineering capacity and an independent financial reviewer. If genuine issuer verification cannot be arranged in time, explicitly retain invoice-derived Gate H as BLOCKED and show historical direct Sandbox proof separately from fictional T1.
5. Do not attempt to make T3 look real using the synthetic channel. A new real pre-enrolled channel and fresh invoice is required for any genuine issuer-based path; the operator's physical callback/portal record must exist.
6. Address the separate planning discrepancy: at this audit's GitHub check, PR #21 was still OPEN and the active development branch did not yet contain `devpost/october-2026-execution-plan.md`. Do not claim it merged until GitHub shows a merged commit and live branch parity.

**Review state:** Await exact-sha CI and bounded self-critical review for this read-only artifact. No deployment and no new payment authority.
