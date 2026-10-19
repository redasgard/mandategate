-- Autonomous AP execution preflight. A standing organization policy is NOT
-- equivalent to explicit delegation of unattended money movement.
-- No grants are seeded, and all grants default to inactive.
create table if not exists autopay_mandates (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  vendor_id text not null references vendors(id),
  destination_id text not null references vendor_destinations(id),
  policy_id text not null references policies(id),
  source text not null check(source in ('agent_api')),
  max_amount_cents integer not null check(max_amount_cents between 1 and 2000000000),
  approved_by_user_id text not null references "user"(id),
  approval_digest text not null check(approval_digest ~ '^[a-f0-9]{64}$'),
  active boolean not null default false,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check((active and revoked_at is null) or (not active)),
  check(expires_at>created_at)
);
create unique index if not exists autopay_mandates_one_active_vendor_source_uq
 on autopay_mandates(organization_id,vendor_id,source) where active=true;
create index if not exists autopay_mandates_org_idx
 on autopay_mandates(organization_id,active,expires_at);

-- Permanent audit rows for future explicit grant/revocation UI. Current PR
-- has no grant mutation endpoint and cannot provision real mandates.
create table if not exists autopay_mandate_events (
  id uuid primary key default gen_random_uuid(),
  mandate_id uuid not null references autopay_mandates(id),
  organization_id text not null references organizations(id),
  actor_user_id text not null references "user"(id),
  event_type text not null check(event_type in ('GRANTED','REVOKED')),
  mandate_digest text not null check(mandate_digest ~ '^[a-f0-9]{64}$'),
  explanation text not null check(length(trim(explanation)) between 16 and 2000),
  created_at timestamptz not null default now()
);
do $$
begin
  if not exists(select 1 from pg_trigger
    where tgname='autopay_mandate_events_immutable'
      and tgrelid='autopay_mandate_events'::regclass) then
    create trigger autopay_mandate_events_immutable
      before update or delete on autopay_mandate_events
      for each row execute function reject_authority_provenance_mutation();
  end if;
end;
$$;
