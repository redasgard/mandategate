alter table invoice_artifacts
  add column if not exists analysis_claim_id text;

alter table invoice_artifacts
  add column if not exists analysis_claimed_at timestamptz;

alter table invoice_artifacts
  add column if not exists analysis_attempts integer not null default 0;

alter table invoice_artifacts
  drop constraint if exists invoice_artifacts_analysis_attempts_chk;

alter table invoice_artifacts
  add constraint invoice_artifacts_analysis_attempts_chk
  check (analysis_attempts >= 0 and analysis_attempts <= 3);

create index if not exists invoice_artifacts_stale_analysis_idx
  on invoice_artifacts (analysis_status, analysis_claimed_at)
  where analysis_status in ('PENDING', 'FAILED');
