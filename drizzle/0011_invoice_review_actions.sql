-- Gate F: separate human verification, issuer attestation and exact approval
-- events. Model/machine principals have no write route to this table.
create table if not exists invoice_review_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  artifact_id text not null,
  binding_id uuid,
  claim_set_id uuid,
  actor_user_id text not null references "user"(id),
  action text not null check(action in (
    'FACTS_VERIFIED', 'ORIGIN_ATTESTED', 'EXACT_TUPLE_APPROVED', 'TUPLE_REVOKED'
  )),
  reason text not null check(length(reason) between 16 and 500),
  evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key(organization_id,artifact_id)
    references invoice_artifacts(organization_id,id),
  foreign key(organization_id,artifact_id,binding_id)
    references payment_authority_bindings(organization_id,artifact_id,id),
  foreign key(organization_id,artifact_id,claim_set_id)
    references invoice_verified_claim_sets(organization_id,artifact_id,id)
);

create index if not exists invoice_review_actions_org_time_idx
  on invoice_review_actions(organization_id,created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname='invoice_review_actions_immutable'
    and tgrelid='invoice_review_actions'::regclass
  ) then
    create trigger invoice_review_actions_immutable
      before update or delete on invoice_review_actions
      for each row execute function reject_authority_provenance_mutation();
  end if;
end;
$$;
