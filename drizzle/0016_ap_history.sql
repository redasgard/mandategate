-- Slice 4: imported AP evidence is inert historical data. It cannot change
-- trusted payment destinations or policy and cannot directly create payouts.
-- These tables are immutable; replacing a CSV produces a new import identity.
create table if not exists ap_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  imported_by_user_id text not null references "user"(id),
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  source_bytes bytea not null check(octet_length(source_bytes) between 1 and 2097152),
  source_record_count integer not null check(source_record_count between 1 and 5000),
  accepted_row_count integer not null check(accepted_row_count between 0 and 5000),
  quarantine_count integer not null check(quarantine_count between 0 and 5000),
  duplicate_count integer not null check(duplicate_count between 0 and 5000),
  ignored_columns jsonb not null,
  created_at timestamptz not null default now(),
  unique(organization_id,source_sha256),
  unique(organization_id,id)
);

create table if not exists ap_history_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  import_id uuid not null,
  source_row_number integer not null check(source_row_number between 2 and 5001),
  normalized_row_sha256 text not null check(normalized_row_sha256 ~ '^[a-f0-9]{64}$'),
  vendor_id text not null,
  vendor_name text not null,
  invoice_number text not null,
  invoice_date text not null,
  amount_cents integer not null check(amount_cents>0 and amount_cents<=2000000000),
  currency text not null check(currency='USD'),
  status text not null,
  due_date text,
  paid_at text,
  observed_payment_destination text,
  department text,
  cost_center text,
  created_at timestamptz not null default now(),
  foreign key(organization_id,import_id) references ap_imports(organization_id,id),
  foreign key(organization_id,vendor_id) references vendors(organization_id,id),
  unique(import_id,source_row_number),
  unique(import_id,normalized_row_sha256)
);
create index if not exists ap_history_rows_baseline_idx
  on ap_history_rows(organization_id,vendor_id,status,invoice_date);
create index if not exists ap_history_rows_invoice_idx
  on ap_history_rows(organization_id,vendor_id,invoice_number);

create table if not exists ap_history_quarantine (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  import_id uuid not null,
  source_row_number integer not null check(source_row_number between 2 and 5001),
  source_row_sha256 text not null check(source_row_sha256 ~ '^[a-f0-9]{64}$'),
  reason_codes jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(organization_id,import_id) references ap_imports(organization_id,id),
  unique(import_id,source_row_number)
);

do $$
declare rel text;
begin
  foreach rel in array array['ap_imports','ap_history_rows','ap_history_quarantine']
  loop
    if not exists(select 1 from pg_trigger where tgname=rel||'_immutable' and tgrelid=rel::regclass) then
      execute format('create trigger %I before update or delete on %I for each row execute function reject_authority_provenance_mutation()', rel||'_immutable', rel);
    end if;
  end loop;
end;
$$;
