-- Synthetic ERP source-authentication test lane. This is never payment authority.
-- A real ERP connector must authenticate actual provider registration and credentials
-- before these receipt semantics may be reused outside disposable CI.
create table if not exists erp_synthetic_source_keys (
  organization_id text not null,
  vendor_id text not null,
  origin_channel_id text not null,
  key_id text not null check (key_id ~ '^fixture_[a-z0-9_-]{4,64}$'),
  key_fingerprint_sha256 text not null check (key_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  registered_by_user_id text not null references "user"(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, vendor_id, origin_channel_id, key_id),
  foreign key (organization_id, vendor_id, origin_channel_id)
    references vendor_origin_channels(organization_id, vendor_id, id)
);

create table if not exists erp_synthetic_signed_invoice_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  vendor_id text not null,
  origin_channel_id text not null,
  key_id text not null,
  artifact_id text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  event_id text not null check (event_id ~ '^evt_[A-Za-z0-9_-]{12,100}$'),
  signed_at timestamptz not null,
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  signature_sha256 text not null check (signature_sha256 ~ '^[0-9a-f]{64}$'),
  invoice_number text not null,
  amount_cents integer not null check (amount_cents between 1 and 2000000000),
  currency text not null check (currency='USD'),
  received_at timestamptz not null default now(),
  foreign key (organization_id, vendor_id, origin_channel_id, key_id)
    references erp_synthetic_source_keys(organization_id, vendor_id, origin_channel_id, key_id),
  foreign key (organization_id, artifact_id, artifact_sha256)
    references invoice_artifacts(organization_id, id, sha256),
  unique (organization_id, origin_channel_id, event_id),
  unique (organization_id, vendor_id, invoice_number)
);

-- Registration keys cannot be replaced or reactivated; revocation is final.
create or replace function guard_erp_synthetic_key_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then
    raise exception 'ERP_SOURCE_KEY_IMMUTABLE';
  end if;
  if new.organization_id is distinct from old.organization_id
    or new.vendor_id is distinct from old.vendor_id
    or new.origin_channel_id is distinct from old.origin_channel_id
    or new.key_id is distinct from old.key_id
    or new.key_fingerprint_sha256 is distinct from old.key_fingerprint_sha256
    or new.registered_by_user_id is distinct from old.registered_by_user_id
    or new.created_at is distinct from old.created_at
    or (old.active=false and new.active=true)
  then
    raise exception 'ERP_SOURCE_KEY_IMMUTABLE';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname='erp_synthetic_source_key_guard'
      and tgrelid='erp_synthetic_source_keys'::regclass
  ) then
    create trigger erp_synthetic_source_key_guard
      before update or delete on erp_synthetic_source_keys
      for each row execute function guard_erp_synthetic_key_mutation();
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname='erp_synthetic_signed_receipt_immutable'
      and tgrelid='erp_synthetic_signed_invoice_receipts'::regclass
  ) then
    create trigger erp_synthetic_signed_receipt_immutable
      before update or delete on erp_synthetic_signed_invoice_receipts
      for each row execute function reject_authority_provenance_mutation();
  end if;
end;
$$;
