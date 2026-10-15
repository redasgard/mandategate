# Render -> Neon database migration gate

**Status: BLOCKED before source export / cutover.**
**Updated:** 2026-10-14 PT
**Target:** Neon project `floral-hill-01811323` / `neondb` / PG18.6 in `aws-us-west-2`.
**Source:** Render Postgres `dpg-db39d5rbc2fs73d1ke70-a` / PG18, expiry 2026-11-06.
**App:** `srv-db39vmm7bikc73c55nh0`, still on Render source database.

## Verified
1. Neon project exists, with Free v3 subscription, and direct query `select current_setting('server_version'), current_database(), count(*) from information_schema.tables where table_schema='public'` returned **PG 18.6**, **neondb**, **0 public tables**.
2. Existing Render DB is available, and connected Render read-only SQL access failed because external allowlist is empty. There is **no source data export** and no basis for claiming migrated rows.
3. Existing app retains Better Auth, Drizzle and `pg`; changing database does not require rewriting identity or moving frontend hosting.
4. G1 Experiential GLM API key is operator-reported configured in Render. Live serving/quota and provider privacy receipts unverified.

## Safe dependency sequence
1. Export data from *inside the existing Render service's permitted network* or via an explicitly authorized source-to-target export job. Do not open source public IP allowlist. The external Render connector cannot export at present.
2. Make a transactionally consistent source snapshot using `pg_dump --format=custom --no-owner --no-acl` from a connected shell. Preserve table schemas, auth sessions, organizational relationships, original invoice bytes, SHA/provenance, payment execution/idempotency rows, webhook receipts, consents, and audit evidence. Handle dump only in encrypted non-public storage, never Git, logs or chat.
3. Obtain Neon **direct** URL for pg_restore/migrations and pooled URL for app connections through secure secrets. Do not print either credential. The initial target is empty: no schema should be seeded before restoring a full dump.
4. Restore with `pg_restore --no-owner --no-acl --exit-on-error` into an isolated target, then verify counts and hashes by table, PK/FK consistency, migration ledger, PayPal logical payout IDs, append-only event-chain verification, receipt/consent history, and multi-tenant auth isolation.
5. Stop writes or implement a controlled final sync and verify no new source commits occurred after the final capture. A standalone earlier dump is not enough to cut over a live source accepting writes.
6. Before Render DATABASE_URL cutover, verify exact SHA local/preview server against Neon, login, invoice read/upload, three synthetic decision paths and **zero** external payout on replays; take rollback snapshot.
7. Update runtime only after a formal review of data parity, credentials, rollback and user-visible availability. Keep original Render PostgreSQL intact until acceptance. Do not auto-rotate/change payout keys.

## Open blockers and decisions
- A trusted source-connected export runner/shell is not exposed by the current Render tools. Export and exact row parity **not done**.
- The app currently uses `DATABASE_URL` for runtime and Drizzle migrations. Use direct URL for migrations and pooled URL for app only after verifying current scripts support the split; do not silently overwrite live env.
- Neon 1 GB free-tier storage and compute allowance require checking source size and measured activity. Free subscription verified, future $0 cost **not guaranteed** if workload exceeds plan limits.
- Reconcile the autonomous-AI single execution lane with critical-path model. AI execution is approved, but independent financial-security review is still required.
- Experiential token sufficiency and actual G1 `glm-5.3-flash` serving response require an authenticated, allowlisted, explicitly consented synthetic-only call. No real data can be sent without strict privacy policy.
- Do not run Gate H one-shot payout or claim G1 PASS.

## Critical self-review
Decision **BLOCK** cutover. Neon readiness is verified, source export/transfer and parity are not. Verification of source restrictions is supported by direct Render tool failure. No source data deleted or copied; no runtime env mutated.
