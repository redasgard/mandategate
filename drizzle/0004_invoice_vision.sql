create table if not exists invoice_image_observations (
  artifact_id text primary key references invoice_artifacts(id),
  organization_id text not null references organizations(id),
  state text not null
    check (state in ('EXTRACTED_UNTRUSTED', 'ESCALATE', 'FAILED')),
  model text not null check (model = 'glm-5.3-flash'),
  prompt_version text,
  prompt_sha256 text,
  provider_name text,
  gateway_request_id text,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  gateway_zdr boolean not null default false,
  extraction jsonb,
  reason_codes jsonb not null default '[]'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  constraint invoice_observation_org_artifact_uq unique (organization_id, artifact_id)
);

create index if not exists invoice_image_observations_org_time_idx
  on invoice_image_observations (organization_id, finished_at desc, artifact_id);
