-- Slice 3A / Gate B. Defines provenance identities, NOT invoice-derived
-- payment authority. No privileged application route writes to these tables.
-- Idempotent: scripts/migrate.ts replays every SQL file on each startup.

create unique index if not exists invoice_artifact_provenance_fk_uq
  on invoice_artifacts (organization_id, id, sha256);
create unique index if not exists vendor_org_identity_fk_uq
  on vendors (organization_id, id);
create unique index if not exists vendor_destination_vendor_fk_uq
  on vendor_destinations (vendor_id, id);
create unique index if not exists policy_org_identity_fk_uq
  on policies (organization_id, id);

create table if not exists invoice_verified_claim_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  artifact_id text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  observation_sha256 text not null check (observation_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  source_kind text not null check (source_kind in ('GLM_IMAGE','PDF_TEXT','HUMAN_TRANSCRIPTION')),
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in ('UNVERIFIED','VERIFIED','REJECTED')),
  verifier_method text,
  verifier_actor text,
  verifier_proof_sha256 text check (
    verifier_proof_sha256 is null or verifier_proof_sha256 ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default now(),
  foreign key (organization_id, artifact_id, artifact_sha256)
    references invoice_artifacts(organization_id, id, sha256),
  constraint invoice_claim_verified_requires_proof_chk check (
    verification_status <> 'VERIFIED' or (
      verifier_method is not null and verifier_actor is not null
      and verifier_proof_sha256 is not null
      and verifier_method in ('INDEPENDENT_SOURCE', 'ADMIN_EXPLICIT')
    )
  )
);

create unique index if not exists invoice_claim_org_artifact_id_fk_uq
  on invoice_verified_claim_sets (organization_id, artifact_id, id);
create unique index if not exists invoice_claim_org_id_fk_uq
  on invoice_verified_claim_sets (organization_id, id);

create table if not exists invoice_claim_field_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  artifact_id text not null,
  claim_set_id uuid not null,
  field_name text not null
    check (field_name in (
      'vendor_name', 'invoice_number', 'invoice_date', 'due_date',
      'currency', 'total_amount_decimal', 'invoice_payment_destination'
    )),
  evidence_index smallint not null default 0
    check (evidence_index between 0 and 5),
  raw_value text,
  normalized_value text,
  source_page smallint check (source_page between 1 and 20),
  source_quote_sha256 text check (
    source_quote_sha256 is null or source_quote_sha256 ~ '^[0-9a-f]{64}$'
  ),
  claimed_value_sha256 text not null check (claimed_value_sha256 ~ '^[0-9a-f]{64}$'),
  trust_tier smallint not null default 1 check (trust_tier between 0 and 2),
  verifier_proof_sha256 text check (
    verifier_proof_sha256 is null or verifier_proof_sha256 ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default now(),
  foreign key (organization_id, artifact_id, claim_set_id)
    references invoice_verified_claim_sets(organization_id, artifact_id, id),
  unique (claim_set_id, field_name, evidence_index),
  constraint invoice_field_corrob_requires_proof_chk check (
    trust_tier < 2 or verifier_proof_sha256 is not null
  )
);

create table if not exists invoice_origin_attestations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  artifact_id text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  vendor_id text not null,
  method text not null check (
    method in ('ADMIN_OUT_OF_BAND', 'TRUSTED_INGRESS', 'SYNTHETIC_FIXTURE')
  ),
  verifier_actor text not null,
  proof_sha256 text not null check (proof_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, artifact_id, artifact_sha256)
    references invoice_artifacts(organization_id, id, sha256),
  foreign key (organization_id, vendor_id)
    references vendors(organization_id, id)
);
create unique index if not exists origin_attestation_org_artifact_vendor_id_fk_uq
  on invoice_origin_attestations(organization_id, artifact_id, vendor_id, id);

create table if not exists payment_authority_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  artifact_id text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  verified_claim_set_id uuid not null,
  origin_attestation_id uuid not null,
  vendor_id text not null,
  destination_id text not null,
  policy_id text not null,
  invoice_number text not null,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 2000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  destination_sha256 text not null check (destination_sha256 ~ '^[0-9a-f]{64}$'),
  policy_snapshot_sha256 text not null check (policy_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  tuple_sha256 text not null check (tuple_sha256 ~ '^[0-9a-f]{64}$'),
  authorization_status text not null default 'PROPOSED'
    check (authorization_status in ('PROPOSED', 'AUTHORIZED', 'CONSUMED', 'REVOKED')),
  approval_actor text,
  approval_proof_sha256 text check (
    approval_proof_sha256 is null or approval_proof_sha256 ~ '^[0-9a-f]{64}$'
  ),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, artifact_id, artifact_sha256)
    references invoice_artifacts(organization_id, id, sha256),
  foreign key (organization_id, artifact_id, verified_claim_set_id)
    references invoice_verified_claim_sets(organization_id, artifact_id, id),
  foreign key (organization_id, artifact_id, vendor_id, origin_attestation_id)
    references invoice_origin_attestations(organization_id, artifact_id, vendor_id, id),
  foreign key (organization_id, vendor_id)
    references vendors(organization_id, id),
  foreign key (vendor_id, destination_id)
    references vendor_destinations(vendor_id, id),
  foreign key (organization_id, policy_id)
    references policies(organization_id, id),
  constraint authority_binding_proof_required_chk check (
    authorization_status not in ('AUTHORIZED','CONSUMED') or (
      approval_actor is not null and approval_proof_sha256 is not null
    )
  ),
  constraint authority_binding_consumed_time_chk check (
    authorization_status <> 'CONSUMED' or consumed_at is not null
  )
);
create unique index if not exists payment_authority_org_artifact_id_fk_uq
  on payment_authority_bindings(organization_id, artifact_id, id);
create index if not exists payment_authority_org_status_idx
  on payment_authority_bindings(organization_id, authorization_status, created_at desc);

create table if not exists parameter_lineage_events (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null,
  sequence bigint not null check (sequence > 0),
  organization_id text not null,
  artifact_id text not null,
  claim_set_id uuid,
  binding_id uuid,
  source_kind text not null check (
    source_kind in ('ARTIFACT', 'MODEL', 'VERIFIER', 'POLICY', 'HUMAN', 'EXECUTOR')
  ),
  trust_tier smallint not null check (trust_tier between 0 and 4),
  event_type text not null,
  source_record_id text,
  field_name text not null,
  observed_value_sha256 text not null check (observed_value_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_value_sha256 text check (
    normalized_value_sha256 is null or normalized_value_sha256 ~ '^[0-9a-f]{64}$'
  ),
  sink_component text,
  sink_field text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, artifact_id)
    references invoice_artifacts(organization_id, id),
  foreign key (organization_id, artifact_id, claim_set_id)
    references invoice_verified_claim_sets(organization_id, artifact_id, id),
  foreign key (organization_id, artifact_id, binding_id)
    references payment_authority_bindings(organization_id, artifact_id, id),
  unique (organization_id, trace_id, sequence)
);
create index if not exists lineage_events_org_artifact_idx
  on parameter_lineage_events(organization_id, artifact_id, sequence);

-- The source snapshots, field evidence, issuer attestations and lineage
-- are append-only. Authorization bindings alone permit later state transitions
-- via a dedicated, not-yet-implemented authority service (Gate E).
create or replace function reject_authority_provenance_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'AUTHORITY_PROVENANCE_IMMUTABLE';
end;
$$;

do $$
declare
  relation_name text;
  trigger_name text;
begin
  foreach relation_name in array array[
    'invoice_verified_claim_sets',
    'invoice_claim_field_sources',
    'invoice_origin_attestations',
    'parameter_lineage_events'
  ]
  loop
    trigger_name := relation_name || '_immutable';
    if not exists (
      select 1 from pg_trigger
      where tgname = trigger_name
        and tgrelid = relation_name::regclass
    ) then
      execute format(
        'create trigger %I before update or delete on %I for each row execute function reject_authority_provenance_mutation()',
        trigger_name, relation_name
      );
    end if;
  end loop;
end;
$$;

create or replace function guard_authority_binding_mutation()
returns trigger language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.artifact_id is distinct from old.artifact_id
    or new.artifact_sha256 is distinct from old.artifact_sha256
    or new.verified_claim_set_id is distinct from old.verified_claim_set_id
    or new.origin_attestation_id is distinct from old.origin_attestation_id
    or new.vendor_id is distinct from old.vendor_id
    or new.destination_id is distinct from old.destination_id
    or new.policy_id is distinct from old.policy_id
    or new.invoice_number is distinct from old.invoice_number
    or new.amount_cents is distinct from old.amount_cents
    or new.currency is distinct from old.currency
    or new.destination_sha256 is distinct from old.destination_sha256
    or new.policy_snapshot_sha256 is distinct from old.policy_snapshot_sha256
    or new.tuple_sha256 is distinct from old.tuple_sha256
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'PAYMENT_BINDING_TUPLE_IMMUTABLE';
  end if;
  if not (
    (old.authorization_status = 'PROPOSED' and new.authorization_status in ('PROPOSED', 'AUTHORIZED', 'REVOKED'))
    or (old.authorization_status = 'AUTHORIZED' and new.authorization_status in ('AUTHORIZED', 'CONSUMED', 'REVOKED'))
    or (old.authorization_status = 'CONSUMED' and new.authorization_status = 'CONSUMED')
    or (old.authorization_status = 'REVOKED' and new.authorization_status = 'REVOKED')
  ) then
    raise exception 'PAYMENT_BINDING_STATE_REGRESSION';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'payment_authority_bindings_mutation_guard'
      and tgrelid = 'payment_authority_bindings'::regclass
  ) then
    create trigger payment_authority_bindings_mutation_guard
    before update on payment_authority_bindings
    for each row execute function guard_authority_binding_mutation();
  end if;
end;
$$;
