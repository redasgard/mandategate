-- S8 emergency policy shutdown. No payout or recipient trust is modified.
create table if not exists policy_shutdown_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  policy_id text not null references policies(id),
  actor_user_id text not null references "user"(id),
  policy_snapshot_sha256 text not null check(policy_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  old_limit_cents integer not null check(old_limit_cents>0),
  explanation text not null check(length(trim(explanation)) between 16 and 2000),
  occurred_at timestamptz not null default now()
);
create index if not exists policy_shutdown_events_org_time_idx
 on policy_shutdown_events(organization_id,occurred_at desc);
do $$
begin
 if not exists(select 1 from pg_trigger where tgname='policy_shutdown_events_immutable'
   and tgrelid='policy_shutdown_events'::regclass) then
   create trigger policy_shutdown_events_immutable before update or delete
    on policy_shutdown_events for each row execute function reject_authority_provenance_mutation();
 end if;
end;
$$;
