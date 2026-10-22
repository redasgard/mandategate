-- Separate append-only verification record for administrator-confirmed
-- recipient changes. This additive migration preserves every existing check,
-- row and legacy resolution; no existing financial constraint is removed.
create table if not exists vendor_recipient_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  case_id uuid not null unique,
  actor_user_id text not null references "user"(id),
  verification_method text not null
    check(verification_method in (
      'KNOWN_CONTACT_CALLBACK','TRUSTED_VENDOR_PORTAL',
      'SIGNED_VENDOR_INSTRUCTION'
    )),
  reason text not null check(length(trim(reason)) between 16 and 2000),
  evidence_reference_sha256 text not null
    check(evidence_reference_sha256 ~ '^[a-f0-9]{64}$'),
  new_destination_id text not null references vendor_destinations(id),
  created_at timestamptz not null default now(),
  foreign key(organization_id,case_id)
    references vendor_reverification_cases(organization_id,id)
);
create index if not exists vendor_recipient_verifications_org_time_idx
  on vendor_recipient_verifications(organization_id,created_at desc);

do $$
begin
  if not exists(select 1 from pg_trigger
    where tgname='vendor_recipient_verifications_immutable'
      and tgrelid='vendor_recipient_verifications'::regclass) then
    create trigger vendor_recipient_verifications_immutable
      before update or delete on vendor_recipient_verifications
      for each row execute function reject_authority_provenance_mutation();
  end if;
end;
$$;
