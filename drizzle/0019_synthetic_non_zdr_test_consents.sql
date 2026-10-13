-- Demo-only disclosure consent: record the human actor and exact original
-- synthetic source before any non-ZDR model request. This is NOT invoice
-- authentication or payment authorization. Records are append-only.
create table if not exists invoice_synthetic_non_zdr_test_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  artifact_id text not null,
  actor_user_id text not null references "user"(id),
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  privacy_mode text not null default 'SYNTHETIC_NON_ZDR_TEST'
    check(privacy_mode='SYNTHETIC_NON_ZDR_TEST'),
  retention_risk_acknowledged boolean not null default true
    check(retention_risk_acknowledged=true),
  created_at timestamptz not null default now(),
  foreign key(organization_id,artifact_id)
    references invoice_artifacts(organization_id,id)
);
create index if not exists invoice_synthetic_non_zdr_test_consents_org_time_idx
  on invoice_synthetic_non_zdr_test_consents(organization_id,created_at desc);

do $$
begin
  if not exists(select 1 from pg_trigger
    where tgname='invoice_synthetic_non_zdr_test_consents_immutable'
    and tgrelid='invoice_synthetic_non_zdr_test_consents'::regclass) then
    create trigger invoice_synthetic_non_zdr_test_consents_immutable
      before update or delete on invoice_synthetic_non_zdr_test_consents
      for each row execute function reject_authority_provenance_mutation();
  end if;
end;
$$;
