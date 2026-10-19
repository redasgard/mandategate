-- 24: Bind unattended requests to an ORIGINAL, immutable grant and enforce
-- lifetime sum and count ceilings at the DATABASE insertion boundary.
-- Existing mandates default to a ZERO budget: upgrade must never grant money.
alter table autopay_mandates
 add column if not exists max_total_amount_cents bigint not null default 0;
alter table autopay_mandates
 add column if not exists max_payment_count integer not null default 0;
do $$
begin
 if not exists(select 1 from pg_constraint where conname='autopay_mandate_budgets_bounds_chk'
   and conrelid='autopay_mandates'::regclass) then
  alter table autopay_mandates add constraint autopay_mandate_budgets_bounds_chk
   check(max_total_amount_cents between 0 and 100000000000
     and max_payment_count between 0 and 10000);
 end if;
end;
$$;

-- Replaced in a new numbered migration. This also safeguards the newly
-- introduced financial fields, preventing a direct SQL limit increase.
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
    or new.max_total_amount_cents is distinct from old.max_total_amount_cents
    or new.max_payment_count is distinct from old.max_payment_count
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

create unique index if not exists autopay_mandate_org_id_fk_uq
 on autopay_mandates(organization_id,id);
create unique index if not exists payment_request_org_id_autopay_fk_uq
 on payment_requests(organization_id,id);

create table if not exists autopay_payment_bindings (
 payment_request_id text primary key,
 organization_id text not null,
 mandate_id uuid not null,
 grant_event_id uuid not null references autopay_mandate_events(id),
 vendor_id text not null,
 invoice_number text not null,
 destination_id text not null,
 policy_id text not null,
 amount_cents integer not null check(amount_cents>0),
 currency text not null check(currency='USD'),
 request_tuple_sha256 text not null check(request_tuple_sha256 ~ '^[0-9a-f]{64}$'),
 grant_digest text not null check(grant_digest ~ '^[0-9a-f]{64}$'),
 bound_at timestamptz not null default now(),
 foreign key(organization_id,payment_request_id)
   references payment_requests(organization_id,id),
 foreign key(organization_id,mandate_id)
   references autopay_mandates(organization_id,id),
 foreign key(organization_id,vendor_id)
   references vendors(organization_id,id),
 foreign key(vendor_id,destination_id)
   references vendor_destinations(vendor_id,id),
 foreign key(organization_id,policy_id)
   references policies(organization_id,id)
);
-- A second idempotency key for the same vendor invoice must not create
-- another independent unattended-payment entitlement.
create unique index if not exists autopay_binding_vendor_invoice_uq
 on autopay_payment_bindings(organization_id,vendor_id,lower(btrim(invoice_number)));

create unique index if not exists autopay_binding_grant_request_uq
 on autopay_payment_bindings(mandate_id,payment_request_id);

create table if not exists autopay_budget_reservations (
 payment_request_id text primary key references autopay_payment_bindings(payment_request_id),
 mandate_id uuid not null references autopay_mandates(id),
 amount_cents integer not null check(amount_cents>0),
 reserved_at timestamptz not null default now()
);
create index if not exists autopay_budget_reserved_grant_idx
 on autopay_budget_reservations(mandate_id,reserved_at);

-- Directly creating an old-ALLOW -> new-grant binding is forbidden.
-- Even an accidentally exposed SQL write path must observe current scope.
create or replace function guard_autopay_payment_binding_insert()
returns trigger language plpgsql as $$
begin
 if not exists(
  select 1 from payment_requests pr
  join payment_decisions pd on pd.payment_request_id=pr.id
  join autopay_mandates g on g.id=new.mandate_id
     and g.organization_id=pr.organization_id
     and g.vendor_id=pr.vendor_id
     and g.destination_id=new.destination_id
     and g.policy_id=new.policy_id
  join autopay_mandate_events ge on ge.id=new.grant_event_id
     and ge.mandate_id=g.id and ge.organization_id=g.organization_id
     and ge.event_type='GRANTED' and ge.mandate_digest=g.approval_digest
     and ge.actor_user_id=g.approved_by_user_id
  join organization_admin_memberships am on am.organization_id=g.organization_id
     and am.user_id=g.approved_by_user_id and am.role='ADMIN'
     and am.active=true
  join vendor_destinations vd on vd.id=g.destination_id
     and vd.vendor_id=pr.vendor_id and vd.trusted=true
  join policies p on p.id=g.policy_id
     and p.organization_id=g.organization_id and p.active=true
  join vendors v on v.id=g.vendor_id and v.organization_id=g.organization_id
  where pr.id=new.payment_request_id and pr.organization_id=new.organization_id
   and pr.vendor_id=new.vendor_id and pr.invoice_number=new.invoice_number
   and pr.source='agent_api' and pr.status='ALLOWED' and pd.outcome='ALLOW'
   and pr.currency='USD' and pr.currency=new.currency
   and pr.amount_cents=new.amount_cents and pr.amount_cents<=g.max_amount_cents
   and pr.amount_cents<=p.auto_pay_max_amount_cents
   and pr.amount_cents<=v.normal_max_amount_cents
   and pr.requested_destination=vd.destination
   and new.grant_digest=g.approval_digest
   and g.active=true and g.revoked_at is null and g.expires_at>now()
   and g.max_total_amount_cents>=pr.amount_cents
   and g.max_payment_count>0
   and ge.created_at<pr.created_at
   and not exists(select 1 from vendor_reverification_cases vc
     left join vendor_reverification_resolutions r on r.case_id=vc.id
     where vc.organization_id=pr.organization_id and vc.vendor_id=pr.vendor_id
     and (r.id is null or r.resolution='SIMULATED_REVERIFIED'))
 ) then
  raise exception 'AUTOPAY_BINDING_AUTHORITY_INVALID';
 end if;
 return new;
end;
$$;

-- The budget row is NOT automatically released on a failed or unknown provider
-- outcome. Conservative accounting prevents duplicate submissions/overspend.
-- A later independently reviewed reversal process can safely be added.
create or replace function guard_autopay_budget_insert()
returns trigger language plpgsql as $$
declare
 grant_row autopay_mandates%rowtype;
 used_amount numeric;
 used_count bigint;
begin
 select * into grant_row from autopay_mandates where id=new.mandate_id for update;
 if not found or grant_row.active is distinct from true or
    grant_row.revoked_at is not null or grant_row.expires_at<=now() or
    grant_row.max_total_amount_cents<=0 or grant_row.max_payment_count<=0 then
   raise exception 'AUTOPAY_BUDGET_GRANT_UNAVAILABLE';
 end if;
 if not exists(select 1 from autopay_payment_bindings b
     join payment_requests pr on pr.id=b.payment_request_id
     join payment_decisions pd on pd.payment_request_id=pr.id
     where b.payment_request_id=new.payment_request_id
       and b.mandate_id=new.mandate_id and b.amount_cents=new.amount_cents
       and b.organization_id=grant_row.organization_id
       and b.grant_digest=grant_row.approval_digest
       and pr.status='ALLOWED' and pd.outcome='ALLOW'
       and pr.source='agent_api' and pr.amount_cents=new.amount_cents
       and pr.currency='USD'
       and not exists(select 1 from payment_executions x
          where x.logical_payment_id=pr.logical_payment_id)
 ) then
   raise exception 'AUTOPAY_BUDGET_BINDING_UNAVAILABLE';
 end if;
 select coalesce(sum(amount_cents),0),count(*) into used_amount,used_count
    from autopay_budget_reservations where mandate_id=new.mandate_id;
 if used_amount+new.amount_cents>grant_row.max_total_amount_cents or
    used_count+1>grant_row.max_payment_count then
    raise exception 'AUTOPAY_BUDGET_EXHAUSTED';
 end if;
 return new;
end;
$$;
do $$
begin
 if not exists(select 1 from pg_trigger where tgname='autopay_payment_binding_guard'
   and tgrelid='autopay_payment_bindings'::regclass) then
  create trigger autopay_payment_binding_guard before insert
    on autopay_payment_bindings for each row
    execute function guard_autopay_payment_binding_insert();
 end if;
 if not exists(select 1 from pg_trigger where tgname='autopay_budget_reservation_guard'
   and tgrelid='autopay_budget_reservations'::regclass) then
  create trigger autopay_budget_reservation_guard before insert
    on autopay_budget_reservations for each row
    execute function guard_autopay_budget_insert();
 end if;
end;
$$;
do $$
declare table_name text;
begin
 foreach table_name in array array['autopay_payment_bindings','autopay_budget_reservations']
 loop
  if not exists(select 1 from pg_trigger
    where tgname=table_name||'_immutable' and tgrelid=table_name::regclass) then
   execute format('create trigger %I before update or delete on %I for each row execute function reject_authority_provenance_mutation()',table_name||'_immutable',table_name);
  end if;
 end loop;
end;
$$;
