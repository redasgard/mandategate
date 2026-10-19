-- S8: explicit, auditable policy proposals. Inferred history never grants authority.
-- Allow one active standing policy per organization; any legacy ambiguity
-- intentionally blocks the migration rather than silently choosing authority.
create unique index if not exists policies_one_active_org_uq
 on policies(organization_id) where active=true;

create table if not exists policy_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  base_policy_id text not null references policies(id),
  base_limit_cents integer not null check(base_limit_cents>0),
  proposed_limit_cents integer not null check(proposed_limit_cents>0),
  origin text not null check(origin in ('ADMIN_MANUAL','PAID_HISTORY')),
  evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  sample_count integer not null default 0 check(sample_count between 0 and 200),
  sample_median_cents integer check(sample_median_cents>0),
  proposal_digest text not null check(proposal_digest ~ '^[a-f0-9]{64}$'),
  version integer not null default 1 check(version>0),
  status text not null default 'PROPOSED' check(status in ('PROPOSED','ACTIVATED','REJECTED')),
  created_by_user_id text not null references "user"(id),
  decided_by_user_id text references "user"(id),
  decision_explanation text,
  activated_policy_id text references policies(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  check(proposed_limit_cents < base_limit_cents),
  check((origin='ADMIN_MANUAL' and sample_count=0 and sample_median_cents is null)
     or (origin='PAID_HISTORY' and sample_count>=3 and sample_median_cents is not null)),
  check((status='PROPOSED' and decided_at is null and activated_policy_id is null)
     or (status='REJECTED' and decided_by_user_id is not null and decided_at is not null and activated_policy_id is null)
     or (status='ACTIVATED' and decided_by_user_id is not null and decided_at is not null and activated_policy_id is not null))
);
create unique index if not exists policy_proposals_one_pending_org_uq
 on policy_proposals(organization_id) where status='PROPOSED';
create index if not exists policy_proposals_org_history_idx
 on policy_proposals(organization_id,created_at desc);

create table if not exists policy_proposal_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references policy_proposals(id),
  organization_id text not null references organizations(id),
  actor_user_id text not null references "user"(id),
  event_type text not null check(event_type in ('PREPARED','EDITED','ACTIVATED','REJECTED')),
  prior_digest text,
  result_digest text not null check(result_digest ~ '^[a-f0-9]{64}$'),
  explanation text not null check(length(trim(explanation)) between 16 and 2000),
  occurred_at timestamptz not null default now()
);
create index if not exists policy_proposal_events_org_time_idx
 on policy_proposal_events(organization_id,occurred_at desc);

do $$
begin
 if not exists(select 1 from pg_trigger where tgname='policy_proposal_events_immutable'
   and tgrelid='policy_proposal_events'::regclass) then
   create trigger policy_proposal_events_immutable before update or delete
    on policy_proposal_events for each row execute function reject_authority_provenance_mutation();
 end if;
end;
$$;
