create table if not exists invoice_artifacts (
  id text primary key,
  organization_id text not null references organizations(id),
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size integer not null
    check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  content bytea not null,
  analysis_status text not null default 'STORED_UNTRUSTED'
    check (analysis_status in ('STORED_UNTRUSTED', 'PENDING', 'EXTRACTED', 'ESCALATED', 'FAILED')),
  created_at timestamptz not null default now(),
  constraint invoice_artifacts_content_length_chk check (octet_length(content) = byte_size),
  constraint invoice_artifacts_org_hash_uq unique (organization_id, sha256)
);

create index if not exists invoice_artifacts_org_created_idx
  on invoice_artifacts (organization_id, created_at desc, id);

-- Original invoice bytes, ownership, and content-addressed identity never change.
create or replace function reject_invoice_artifact_content_mutation()
returns trigger language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.content is distinct from old.content
     or new.sha256 is distinct from old.sha256
     or new.mime_type is distinct from old.mime_type
     or new.byte_size is distinct from old.byte_size
     or new.created_at is distinct from old.created_at
  then
    raise exception 'INVOICE_ARTIFACT_CONTENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_artifacts_immutable_content on invoice_artifacts;
create trigger invoice_artifacts_immutable_content
before update on invoice_artifacts
for each row execute function reject_invoice_artifact_content_mutation();
