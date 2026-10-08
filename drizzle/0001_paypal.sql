alter table payment_requests add column if not exists idempotency_key text;
create unique index if not exists payment_requests_org_idempotency_uq
  on payment_requests (organization_id, idempotency_key);

create table if not exists payment_executions (
  id text primary key,
  payment_request_id text not null unique references payment_requests(id),
  logical_payment_id text not null unique references payment_requests(logical_payment_id),
  status text not null,
  paypal_request_id text not null unique,
  sender_batch_id text not null unique,
  sender_item_id text not null unique,
  paypal_payout_batch_id text unique,
  paypal_payout_item_id text unique,
  raw_paypal_status text,
  claimed_at timestamptz,
  submitted_at timestamptz,
  last_reconciled_at timestamptz,
  outcome_unknown_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_execution_events (
  id text primary key,
  logical_payment_id text not null references payment_requests(logical_payment_id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_execution_events_payment_idx
  on payment_execution_events (logical_payment_id, created_at, id);
