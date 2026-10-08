create table if not exists paypal_webhook_receipts (
  event_id text primary key,
  event_type text not null,
  paypal_payout_batch_id text,
  paypal_payout_item_id text,
  logical_payment_id text references payment_requests(logical_payment_id),
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED', 'PROCESSING', 'RETRY', 'PROCESSED')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists paypal_webhook_receipts_recovery_idx
  on paypal_webhook_receipts (status, updated_at, received_at);
