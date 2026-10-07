CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_principals (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendors (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  normal_max_amount_cents integer NOT NULL CHECK (normal_max_amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_destinations (
  id text PRIMARY KEY,
  vendor_id text NOT NULL REFERENCES vendors(id),
  destination text NOT NULL,
  trusted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policies (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  auto_pay_max_amount_cents integer NOT NULL CHECK (auto_pay_max_amount_cents > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id text PRIMARY KEY,
  logical_payment_id text NOT NULL UNIQUE,
  organization_id text NOT NULL REFERENCES organizations(id),
  vendor_id text NOT NULL REFERENCES vendors(id),
  invoice_number text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  requested_destination text NOT NULL,
  status text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_decisions (
  id text PRIMARY KEY,
  payment_request_id text NOT NULL UNIQUE REFERENCES payment_requests(id),
  outcome text NOT NULL CHECK (outcome IN ('ALLOW', 'ESCALATE', 'DENY')),
  reason_codes jsonb NOT NULL,
  evidence jsonb NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_requests_org_created_idx
  ON payment_requests (organization_id, created_at DESC);
