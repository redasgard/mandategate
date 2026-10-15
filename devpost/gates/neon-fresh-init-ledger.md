# Fresh Neon initialization ledger

Date: 2026-10-14 PT. Project: `floral-hill-01811323`, DB `neondb`. Source branch: `build/slice-3-invoice-intake`.

**Verified applied to fresh Neon**: SQL files 0000–0007 in numerical order. 0000–0002 successfully applied in first session; 0003–0007 applied in second session via Neon transactional prepared one-statement-at-a-time execution. In 0003 the harmless fresh-target `DROP TRIGGER IF EXISTS` was replaced by `CREATE OR REPLACE TRIGGER` to avoid destructive SQL, and in 0005 unnecessary fresh-target `DROP CONSTRAINT IF EXISTS` was omitted. These deviations need differential parity review against the canonical `scripts/migrate.ts` output.

**Failure at 0008**: Postgres error `relation "user" does not exist`. Transactional 0008 was rolled back. This is an *expected ordering dependency*: repository `scripts/migrate.ts` runs Better Auth `getMigrations(auth.options).runMigrations()` **before** 0000–0019, while the direct Neon SQL path ran application migrations first. The existing `src/auth/auth.ts` includes Better Auth with disabled signups. `scripts/seed.ts` creates admin using Better Auth and then its org membership, not a hand-crafted SQL auth record.

**Remaining**: create Better Auth's exact native tables using `scripts/migrate.ts` / Better Auth `getMigrations`; complete 0008–0019; run `scripts/seed.ts` with configured demo keys securely; validate counts, auth, permissions, idempotency and all scenario paths. Do not invent auth SQL or use the Render live DB as a migration scratchpad.

**Safe execution route**: connect an isolated Node 24/PNPM environment to this *new* Neon branch with a direct `DATABASE_URL` and a throwaway >=32-character `BETTER_AUTH_SECRET`, execute only the Better Auth creation part of `scripts/migrate.ts`, then run canonical migrations. Prefer an isolated preview/CI secret, not replacing Render live `DATABASE_URL` until full verification. Never log DB passwords, seed passwords, PayPal secrets, API keys, or private invoice data.

**Environment**: Render remains configured for its original PostgreSQL database and retained audit/payment receipts. No hosted cutover or payment action. Do not claim Neon ready.

**Critical self-review**: BLOCK Neon cutover; source SQL ordering deviation observed; recovery path established.