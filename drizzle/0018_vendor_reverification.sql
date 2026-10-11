-- Slice 5: destination changes trigger a separate, immutable verification
-- case; the original DENY decision remains immutable and unpayable.
create table if not exists vendor_reverification_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  vendor_id text not null,
  payment_request_id text not null references payment_requests(id),
  observed_destination_sha256 text not null
    check(observed_destination_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  foreign key(organization_id,vendor_id) references vendors(organization_id,id),
  unique(payment_request_id),
  unique(organization_id,id)
);
create index if not exists vendor_reverification_org_status_idx
  on vendor_reverification_cases(organization_id,vendor_id,created_at desc);

-- Only a distinct actor-authorized (or explicitly demo-simulated) trust
-- workflow can resolve a mismatch. This is NOT an ordinary invoice approval.
create table if not exists vendor_reverification_resolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  case_id uuid not null unique,
  actor_user_id text not null references "user"(id),
  resolution text not null check(resolution in ('REJECTED','SIMULATED_REVERIFIED')),
  reason text not null check(length(trim(reason)) between 16 and 2000),
  evidence_reference_sha256 text not null
    check(evidence_reference_sha256 ~ '^[a-f0-9]{64}$'),
  new_destination_id text,
  created_at timestamptz not null default now(),
  foreign key(organization_id,case_id)
    references vendor_reverification_cases(organization_id,id),
  foreign key(new_destination_id) references vendor_destinations(id),
  check(
    (resolution='REJECTED' and new_destination_id is null)
    or
    (resolution='SIMULATED_REVERIFIED' and new_destination_id is not null)
  )
);
create index if not exists vendor_reverification_resolutions_org_time_idx
  on vendor_reverification_resolutions(organization_id,created_at desc);

do $$
declare r text;
begin
  foreach r in array array['vendor_reverification_cases','vendor_reverification_resolutions']
  loop
    if not exists(select 1 from pg_trigger
      where tgname=r||'_immutable' and tgrelid=r::regclass) then
      execute format('create trigger %I before update or delete on %I for each row execute function reject_authority_provenance_mutation()',r||'_immutable',r);
    end if;
  end loop;
end;
$$;
