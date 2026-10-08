-- Gate D: an issuer's trusted channel comes from a separately administered
-- organization/vendor registry, NEVER from invoice content or model output.
create table if not exists organization_admin_memberships (
  user_id text not null references "user"(id),
  organization_id text not null references organizations(id),
  role text not null check (role in ('ADMIN', 'REVIEWER')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);

create index if not exists organization_admin_memberships_active_org_idx
  on organization_admin_memberships(organization_id, role)
  where active = true;

create table if not exists vendor_origin_channels (
  id text primary key,
  organization_id text not null references organizations(id),
  vendor_id text not null,
  kind text not null check (kind in ('KNOWN_CALLBACK', 'TRUSTED_PORTAL', 'ERP_INTEGRATION', 'SYNTHETIC_FIXTURE')),
  enrolled_evidence_sha256 text not null check (enrolled_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  enrolled_by_user_id text references "user"(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id, vendor_id) references vendors(organization_id, id),
  constraint vendor_origin_channels_org_vendor_id_uq unique (organization_id, vendor_id, id),
  constraint vendor_origin_channels_real_enrollment_chk check (
    kind = 'SYNTHETIC_FIXTURE' or enrolled_by_user_id is not null
  )
);

alter table invoice_origin_attestations
  add column if not exists origin_channel_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoice_origin_attestations_channel_fk'
      and conrelid = 'invoice_origin_attestations'::regclass
  ) then
    alter table invoice_origin_attestations
      add constraint invoice_origin_attestations_channel_fk
      foreign key (organization_id, vendor_id, origin_channel_id)
      references vendor_origin_channels(organization_id, vendor_id, id);
  end if;
end;
$$;

-- No new attestation may omit the independent registry channel.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoice_origin_attestations_channel_required_chk'
      and conrelid = 'invoice_origin_attestations'::regclass
  ) then
    alter table invoice_origin_attestations
      add constraint invoice_origin_attestations_channel_required_chk
      check (origin_channel_id is not null) not valid;
  end if;
end;
$$;

-- An origin channel's enrolled identity and evidence cannot be edited.
-- Revocation via active true->false is permanent for that ID.
create or replace function guard_vendor_origin_channel_mutation()
returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.vendor_id is distinct from old.vendor_id
    or new.kind is distinct from old.kind
    or new.enrolled_evidence_sha256 is distinct from old.enrolled_evidence_sha256
    or new.enrolled_by_user_id is distinct from old.enrolled_by_user_id
    or new.created_at is distinct from old.created_at
    or (old.active = false and new.active = true)
  then
    raise exception 'ORIGIN_CHANNEL_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'vendor_origin_channels_mutation_guard'
      and tgrelid = 'vendor_origin_channels'::regclass
  ) then
    create trigger vendor_origin_channels_mutation_guard
      before update or delete on vendor_origin_channels
      for each row execute function guard_vendor_origin_channel_mutation();
  end if;
end;
$$;
