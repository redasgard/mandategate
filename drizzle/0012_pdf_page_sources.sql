-- Slice 3: deterministic, non-model PDF page text provenance.
-- A page-text SHA-256 is NOT a signature of the PDF's page drawing objects.
-- The immutable full-artifact SHA-256 binds the bytes used for extraction.
create table if not exists invoice_pdf_source_pages (
  organization_id text not null,
  artifact_id text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  parser_version text not null check (length(parser_version) between 10 and 100),
  page_number smallint not null check (page_number between 1 and 20),
  total_pages smallint not null check (total_pages between 1 and 20),
  page_text text not null check (length(page_text) between 1 and 100000),
  page_text_sha256 text not null check (page_text_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (organization_id, artifact_id, parser_version, page_number),
  foreign key (organization_id, artifact_id, artifact_sha256)
    references invoice_artifacts(organization_id, id, sha256)
);
create index if not exists invoice_pdf_source_artifact_idx
  on invoice_pdf_source_pages(organization_id,artifact_id,page_number);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname='invoice_pdf_source_pages_immutable'
    and tgrelid='invoice_pdf_source_pages'::regclass
  ) then
    create trigger invoice_pdf_source_pages_immutable
      before update or delete on invoice_pdf_source_pages
      for each row execute function reject_authority_provenance_mutation();
  end if;
end;
$$;
