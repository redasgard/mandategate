-- Gate E: idempotent immutable proposal identity; no payout route yet.
create unique index if not exists payment_authority_org_tuple_uq
  on payment_authority_bindings (organization_id, artifact_id, tuple_sha256);

create unique index if not exists payment_authority_org_id_uq
  on payment_authority_bindings (organization_id, id);

-- Explicit proposal status is an immutable part of the proposed tuple.
alter table payment_authority_bindings
  add column if not exists proposed_outcome text
  check (proposed_outcome in ('ALLOW', 'ESCALATE', 'DENY'));

alter table payment_authority_bindings
  add column if not exists proposed_reason_codes jsonb not null default '[]'::jsonb;

-- Reject later rewriting of proposal rationale.
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
  if old.authorization_status in ('CONSUMED', 'REVOKED')
    and (
      new.consumed_at is distinct from old.consumed_at
      or new.revoked_at is distinct from old.revoked_at
    )
  then
    raise exception 'PAYMENT_BINDING_TERMINAL_IMMUTABLE';
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
