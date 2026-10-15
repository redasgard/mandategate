# Neon recovery stage: verified, deployment preparation next

## Critique gate

**Step:** Complete the isolated Neon preview restart/recovery stage.
**Decision:** CONTINUE
**Score:** 8.9/10
**Review independence:** self-review, supplemented by local regression tests and externally executed GitHub Actions.
**Decision scope:** Proceed to controlled deployment preparation and integration review. This is not a live Render cutover or financial-release verdict.

## Evidence checked

- Application source: `7e7d743c9f36d2926a8a103d4c1a58a4c1ce9c89`, repair/neon-isolated-preview.
- Recovery workflow: `81a892c190e019960d6fbbcccf2027d8e3fb29e6`, main; source checkout and action dependencies pinned.
- Recovery run: https://github.com/redasgard/mandategate/actions/runs/38686522495, job 116262509531, SUCCESS. Inspected step outcomes and actual logs, not only a green badge.
- Full source CI: https://github.com/redasgard/mandategate/actions/runs/38686498331, SUCCESS on the same application source.
- Versioned framework source: https://github.com/vercel/next.js/blob/v16.3.8/packages/next/src/server/lib/start-server.ts, cleanup implementation exits 143 for SIGTERM and 130 for SIGINT.
- Local regression: the Next-like exit-143 fixture failed with the old supervisor; it passed after repair. An exit-1 fixture is explicitly rejected after repair. Occupied-port and unsafe-startup cases also pass.
- Live Neon metadata: project floral-hill-01811323, branch br-blue-paper-arr35som, neondb, exact endpoint ep-silent-poetry-arjowm4d. Read-only metadata check showed 10,043,392 bytes and zero payment executions.

## Verified external result

Recorded at **2026-10-15T05:24:33.511Z** (October 14 Pacific).

| Check | Observed result |
| --- | --- |
| Missing payment kill switch | Refused before server launch |
| Non-Neon database | Refused before server launch |
| PayPal credentials present | Refused before server launch |
| First real Next server | PID 2604, supervisor 2596; readiness passed, webhook 503, both stopped, port closed |
| Second real Next server | PID 2625, supervisor 2618; readiness passed, webhook 503, both stopped, port closed |
| Server replacement | Distinct server and supervisor PIDs |
| Public-table row fingerprints | All 32 unchanged between snapshots |
| Combined fingerprint | b653c8c738c2b92f2418c34b6b32ca1f6522fc786feba3902a862431f5ba52a7 |
| Payment executions | 0 before and after |
| Cleanup | Both owned servers stopped; no persistent preview created |
| Evidence retention | Sanitized proof copied into GitHub job summary |

The test uses localhost-only Next instances on an ephemeral GitHub runner, the existing Neon fixture database, default read-only PostgreSQL configuration, and no PayPal or model-provider credentials. It runs no migrations, seeding, credential rotation, or payment proof.

## Artifact scores

| Artifact | Score | Main limitation |
| --- | ---: | --- |
| Preview supervisor and regression test | 9.0 | Host-specific service deployment is separate |
| Pinned recovery workflow and verifier | 8.8 | Restart proof is not Render configuration rollback |
| Integrated bounded stage | 8.9 | Self-review, not independent financial certification |

Weighted axes: correctness 9.0, requirement alignment 9.0, evidence 9.0, safety 9.0, completeness 8.5, simplicity 8.0; weighted result 8.9.

## Findings and repairs

1. **HIGH, resolved: previous restart test could pass without proving shutdown.** The former shell loop killed a package-manager PID, slept, and could reuse an existing listener. Replacement observes the actual server PID, supervisor closure, closed TCP port, process disappearance, and a different server after restart. Those checks passed against the real Next server.
2. **MEDIUM, resolved: valid Next shutdown misclassified.** The supervisor initially treated exit 143 as failure. The pinned Next source establishes its meaning. The repair accepts a signal-coded exit only after the matching shutdown request, without forced termination. The test still rejects actual exit-1 failures.
3. **MEDIUM, resolved for this stage: mutable test source and broad credential exposure.** Checkout now uses an exact source SHA. Actual Neon secrets are supplied only to runtime verification, not package installation or build. The verifier binds the exact database endpoint and refuses provider credentials.
4. **LOW, retained: build-time schema warning.** A build with a dummy localhost database emits Better Auth schema-validation warnings but completes. Actual Neon readiness is checked separately. Do not label the build a live schema verification.

## Requirement coverage

**VERIFIED:** clean process shutdown and restart, negative startup guards, webhook blocking, exact source identity, zero execution rows, unchanged public-table row fingerprints, bounded cleanup.

**UNVERIFIED / outside this stage:** Render-specific deployment and configuration rollback, hosted credential binding, full payment-authorization review, GLM inference/quota, historical Render-data archival, and database cutover. No paid infrastructure or live Render setting was changed in this stage.

Row fingerprints check accidental record changes, not a cryptographic tamper-proof audit or complete schema-equivalence proof. Login was intentionally excluded from the snapshot interval because it creates session records; prior login tests are separate evidence.

## Repair order

The two concrete recovery defects are repaired and retested. No unresolved HIGH or CRITICAL issue remains in this bounded restart gate. Do not re-run the old weak shell test as a substitute for this verifier.

## Next stage: controlled deployment preparation

1. Open a reviewable repair-branch PR against build/slice-3-invoice-intake, retaining the exact tested source. Do not auto-merge: that branch is connected to Render auto-deploy.
2. Prepare a single-demo-environment transition using the already-approved fresh Neon direction. No additional paid service, database reset, or data-export requirement is introduced.
3. Bind startup to `node --experimental-strip-types scripts/neon-preview-start.ts`, not the current `pnpm db:migrate && pnpm demo:seed && pnpm start` chain. Preserve old settings securely for backout. The existing demo must not silently reseed Neon credentials during transition.
4. Bind the intended Neon endpoint, existing demo credentials and disabled-payment mode through approved secret handling. Hosted authentication, health, scope denial, disabled payment paths and backout must be checked before declaring the hosted transition complete.
5. Keep the original Render database intact. Never present its historical Sandbox receipt as a payment executed in fresh Neon. No new payout or GLM call is authorized merely by this recovery result.

The user approved autonomous work and the fresh-Neon direction. Remaining constraints concern verified execution and reversible configuration, not a demand for additional human developers.
