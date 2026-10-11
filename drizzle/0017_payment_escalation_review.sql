-- Slice 4: review of an escalated canonical request is separate from
-- any model/extracted evidence and never rewrites the original decision.
create table if not exists payment_escalation_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  payment_request_id text not null unique references payment_requests(id),
  reviewer_user_id text not null references "user"(id),
  action text not null check(action in ('ACCEPT','DECLINE')),
  explanation text not null check(length(trim(explanation)) between 16 and 2000),
  request_snapshot_sha256 text not null check(request_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_mime_type text,
  evidence_sha256 text check(evidence_sha256 is null or evidence_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_bytes bytea check(evidence_bytes is null or octet_length(evidence_bytes) between 1 and 1048576),
  execution_choice text not null default 'IMMEDIATE' check(execution_choice='IMMEDIATE'),
  created_at timestamptz not null default now(),
  check (
    (evidence_bytes is null and evidence_sha256 is null and evidence_mime_type is null)
    or (evidence_bytes is not null and evidence_sha256 is not null and evidence_mime_type in
      ('application/pdf','image/png','image/jpeg'))
  )
);
create index if not exists payment_escalation_reviews_org_time_idx
  on payment_escalation_reviews(organization_id,created_at desc);

do $$
begin
  if not exists(select 1 from pg_trigger
    where tgname='payment_escalation_reviews_immutable'
    and tgrelid='payment_escalation_reviews'::regclass) then
    create trigger payment_escalation_reviews_immutable before update or delete
    on payment_escalation_reviews for each row
    execute function reject_authority_provenance_mutation();
  end if;
end;
$$;
