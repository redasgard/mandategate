create table if not exists invoice_artifacts (
  id text primary key,
  organization_id text not null references organizations(id),
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size integer not null
    check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (length(sha256) = 64),
  content bytea not null,
  analysis_status text not null default 'STORED_UNTRUSTED'
    check (analysis_status in ('STORED_UNTRUSTED', 'PENDING', 'EXTRACTED', 'ESCALATED', 'FAILED')),
  created_at timestamptz not null default now(),
  constraint invoice_artifacts_content_length_chk check (octet_length(content) = byte_size),
  constraint invoice_artifacts_org_hash_uq unique (organization_id, sha256)
);

create index if not exists invoice_artifacts_org_created_idx
  on invoice_artifacts (organization_id, created_at desc, id);
