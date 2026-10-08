-- Gate E2: only a specifically approved, single-use binding can back an
-- invoice-derived payment. Direct trusted agent_api requests remain distinct.
alter table payment_requests
  add column if not exists authority_binding_id uuid;

alter table payment_authority_bindings
  add column if not exists linked_payment_request_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='payment_requests_verified_origin_chk'
      and conrelid='payment_requests'::regclass
  ) then
    alter table payment_requests
      add constraint payment_requests_verified_origin_chk check (
        (source='verified_invoice' and authority_binding_id is not null)
        or (source<>'verified_invoice' and authority_binding_id is null)
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='payment_requests_authority_fk'
      and conrelid='payment_requests'::regclass
  ) then
    alter table payment_requests
      add constraint payment_requests_authority_fk
      foreign key (organization_id,authority_binding_id)
      references payment_authority_bindings(organization_id,id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='payment_authority_linked_request_fk'
      and conrelid='payment_authority_bindings'::regclass
  ) then
    alter table payment_authority_bindings
      add constraint payment_authority_linked_request_fk
      foreign key (linked_payment_request_id)
      references payment_requests(id);
  end if;
end;
$$;

create unique index if not exists payment_requests_binding_single_use_uq
  on payment_requests(authority_binding_id)
  where authority_binding_id is not null;

create unique index if not exists payment_requests_verified_invoice_natural_uq
  on payment_requests(organization_id,vendor_id,invoice_number)
  where source='verified_invoice';

-- Keep the previous immutable-tuple trigger, tighten terminal linkage.
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
    or new.proposed_outcome is distinct from old.proposed_outcome
    or new.proposed_reason_codes is distinct from old.proposed_reason_codes
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'PAYMENT_BINDING_TUPLE_IMMUTABLE';
  end if;
  if old.authorization_status in ('AUTHORIZED','CONSUMED','REVOKED')
    and (
      new.approval_actor is distinct from old.approval_actor
      or new.approval_proof_sha256 is distinct from old.approval_proof_sha256
    )
  then
    raise exception 'PAYMENT_BINDING_APPROVAL_IMMUTABLE';
  end if;
  if old.linked_payment_request_id is not null
    and new.linked_payment_request_id is distinct from old.linked_payment_request_id
  then
    raise exception 'PAYMENT_BINDING_REQUEST_LINK_IMMUTABLE';
  end if;
  if old.authorization_status in ('CONSUMED', 'REVOKED')
    and (
      new.consumed_at is distinct from old.consumed_at
      or new.revoked_at is distinct from old.revoked_at
    )
  then
    raise exception 'PAYMENT_BINDING_TERMINAL_IMMUTABLE';
  end if;
  if new.authorization_status='CONSUMED'
    and (new.linked_payment_request_id is null or new.consumed_at is null)
  then
    raise exception 'PAYMENT_BINDING_CONSUMPTION_INCOMPLETE';
  end if;
  if not (
    (old.authorization_status='PROPOSED' and new.authorization_status in ('PROPOSED','AUTHORIZED','REVOKED'))
    or (old.authorization_status='AUTHORIZED' and new.authorization_status in ('AUTHORIZED','CONSUMED','REVOKED'))
    or (old.authorization_status='CONSUMED' and new.authorization_status='CONSUMED')
    or (old.authorization_status='REVOKED' and new.authorization_status='REVOKED')
  ) then
    raise exception 'PAYMENT_BINDING_STATE_REGRESSION';
  end if;
  return new;
end;
$$;
