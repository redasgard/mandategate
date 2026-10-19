-- 23: Unattended-payment mandates must be activated by an auditable,
-- exact-state human confirmation. An inactive row is only a proposal.
-- Existing data and migrations are never rewritten in place.
create or replace function guard_autopay_mandate_mutation()
returns trigger language plpgsql as $$
begin
  if TG_OP='DELETE' then
    raise exception 'AUTOPAY_MANDATE_IMMUTABLE';
  end if;
  if TG_OP='INSERT' then
    if new.active or new.revoked_at is not null then
      raise exception 'AUTOPAY_GRANT_REQUIRES_EXPLICIT_CONFIRMATION';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.vendor_id is distinct from old.vendor_id
    or new.destination_id is distinct from old.destination_id
    or new.policy_id is distinct from old.policy_id
    or new.source is distinct from old.source
    or new.max_amount_cents is distinct from old.max_amount_cents
    or new.approved_by_user_id is distinct from old.approved_by_user_id
    or new.approval_digest is distinct from old.approval_digest
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'AUTOPAY_MANDATE_SCOPE_IMMUTABLE';
  end if;
  if old.revoked_at is not null then
    if new.active or new.revoked_at is distinct from old.revoked_at then
      raise exception 'AUTOPAY_REVOKED_MANDATE_TERMINAL';
    end if;
  elsif not old.active and new.active then
    if new.revoked_at is not null or
      not exists(select 1 from autopay_mandate_events e
        where e.mandate_id=old.id and e.organization_id=old.organization_id
          and e.event_type='GRANTED' and e.actor_user_id=old.approved_by_user_id
          and e.mandate_digest=old.approval_digest)
    then
      raise exception 'AUTOPAY_GRANT_EVENT_REQUIRED';
    end if;
  elsif old.active and not new.active then
    if new.revoked_at is null or
      not exists(select 1 from autopay_mandate_events e
        where e.mandate_id=old.id and e.organization_id=old.organization_id
          and e.event_type='REVOKED' and e.mandate_digest=old.approval_digest)
    then
      raise exception 'AUTOPAY_REVOCATION_EVENT_REQUIRED';
    end if;
  elsif new.active is distinct from old.active
    or new.revoked_at is distinct from old.revoked_at then
    raise exception 'AUTOPAY_MANDATE_STATE_INVALID';
  end if;
  return new;
end;
$$;
do $$
begin
  if not exists(select 1 from pg_trigger
    where tgname='autopay_mandates_guard'
    and tgrelid='autopay_mandates'::regclass) then
    create trigger autopay_mandates_guard before insert or update or delete
      on autopay_mandates for each row execute function guard_autopay_mandate_mutation();
  end if;
end;
$$;
-- A GRANTED event is unique even when the original prepared record is stale.
create unique index if not exists autopay_mandate_granted_event_uq
 on autopay_mandate_events(mandate_id) where event_type='GRANTED';
create unique index if not exists autopay_mandate_revoked_event_uq
 on autopay_mandate_events(mandate_id) where event_type='REVOKED';
