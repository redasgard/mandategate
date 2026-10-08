# Slice 3A Authority Boundary Plan: Critical Review

## Critique gate

**Step:** Architecture and executable repair order for invoice-derived payment authority after the SANS / Urd source-to-sink audit.
**Decision:** CONTINUE (only to implementing Gate A and other non-dependent, isolated work; the separate invoice-to-payment integration BLOCK remains).
**Score:** 9.1/10 for the plan, NOT for existing prompt-injection resistance.
**Review independence:** self-review supplemented by direct GitHub source inspection and deterministic documentation consistency checks.

### Evidence checked

- devpost/authority-boundary-plan.md, revised after review to require independent issuer/source attestation rather than a generic human confirmation.
- devpost/spec.md > Provenance-Enforced Invoice Authority (planned).
- devpost/checklist.md > Slice 3, eight explicitly unchecked authority subgates.
- devpost/build-state.md with explicit current Slice 3 BLOCK.
- devpost/reviews/slice-3-injection-boundary-audit.md, which reports two HIGH findings in the implemented architecture.
- Existing source: src/auth/machine.ts; scripts/seed.ts; app/api/agent/payment-requests/route.ts; src/payments/submit.ts; src/policy/decision.ts; src/invoices/schema.ts; src/invoices/image-analysis.ts; src/payments/executor/service.ts.
- Current PR #2 remains draft and unmerged.
- All nine mechanical plan consistency checks passed. No application code was changed as part of the planning milestone.

### Artifact scores

| Artifact | Score | Main weakness |
| --- | ---: | --- |
| Threat model and trust classification | 9.5 | Depends on making actual origin-verification channels enforceable |
| Identity/scope split | 9.4 | Existing demo seed must migrate scopes without a dual-scope compatibility hole |
| Independent evidence and authorization contract | 9.2 | Exact verification algorithm and database constraints belong to implementation |
| Approval binding and PayPal handoff | 9.0 | External payout is not atomic with PostgreSQL policy changes |
| Urd-style adversarial matrix | 9.2 | Tests are specified but have not been executed |
| Hackathon scope and operational maintainability | 8.2 | Four authority-record components can become unnecessarily broad |

### Findings

1. **MEDIUM — Trusted origin attestation must be grounded in a concrete independent channel**
   - Evidence: Gate D currently allows authorized admin verification or a marked synthetic pre-attested fixture, but a real organization-specific trusted supplier channel is not yet integrated.
   - Impact: inspecting an invoice or reading its logo is not proof of supplier identity. Without this, genuine uploaded invoices must remain ESCALATE even if extracted perfectly.
   - Required repair: when implementing Gate D, document the exact pre-existing contact/ERP-authenticated identity channel and how its evidence is bound to the artifact. Demonstrate that attacker-controlled origin hints cannot satisfy it. Use clearly labeled synthetic attestation for the demo.
   - Verification: forged vendor name/account with no independently verified channel is refused; attested synthetic test source passes in the controlled demo only.
   - Why no planning BLOCK: the draft explicitly defines fail-closed default and makes this a dependency of ALLOW.

2. **MEDIUM — Define version/race behavior at the PayPal network boundary before implementation**
   - Evidence: Gate E requires a final pre-submit revalidation but appropriately acknowledges that PostgreSQL and PayPal cannot share an atomic transaction.
   - Impact: policy revocation or destination change concurrent with a dispatched payout can produce a time-of-check/use window.
   - Required repair: in Gate E's code design, specify transaction isolation/locks, moment of frozen-authority consumption, handling of revocation during a SUBMITTING lease, and the observable audit outcome when a remote call has already begun.
   - Verification: adversarial race tests for revocation before claim, while claiming, after dispatch, and during PayPal unknown-outcome recovery.
   - Why no planning BLOCK: the plan identifies the limitation, retains permanent idempotency and binds current authorization before execution.

3. **LOW — Minimize new persistent authorization tables**
   - Evidence: the proposed design separates claims, origin attestations, bindings, lineage, and payment-request links.
   - Impact: an overbuilt data model could consume hackathon time and increase migration fragility.
   - Required repair: Gate B should prefer narrowly scoped append-only records and avoid a second generic workflow engine.
   - Verification: every new table/column has an invariant, query, test, or trace need that cannot be met by an existing table.

### Requirement coverage

- **VERIFIED:** plan has ordered Gates A-H; existing Slice 2 is explicitly isolated; trust tiers distinguish document observation, corroboration, origin attestation and authorization; privileged direct request scope separation planned; source-to-sink tampering, cross-tenant, stale approval, malicious value and marker-ablation tests specified; planned artifact is cross-linked from spec/checklist/build-state; draft PR remains unmerged.
- **SUPPORTED:** design would address the two HIGH findings once implemented, assuming independent verification and runtime enforcement are demonstrated.
- **UNVERIFIED:** actual separation of deployed credentials; database claims/approval constraints; real issuer attestation; comprehensive source-to-sink traces; real adversarial Flash tests and Sandbox invoice proof.
- **INCORRECT:** no implementation or security-completion claim was made. A passing documentation check must not be interpreted as proving a repaired payment boundary.

### Repair order

1. Proceed only with Gate A: implement and test machine-principal separation while preserving the existing direct PayPal flow.
2. Build an immutable, minimal evidence schema and explicit independent verification channel for Gate B-D.
3. Implement Gates E-F with precise approval binding and network-race semantics.
4. Run the actual Gate G-H hostile-value traces and PayPal proof before re-reviewing the previously BLOCKED invoice-to-payment integration.

### Next gate

**CONTINUE planning handoff to Gate A only.** Keep draft PR #2 blocked for merger/payment integration until each subgate is implemented and verified, then a separate integration Critical Review yields CONTINUE.
