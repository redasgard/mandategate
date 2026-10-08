-- Parser-backed PDF claims carry the exact immutable page text digest.
-- Nulls remain valid for image/human-only unverified observations.
alter table invoice_claim_field_sources
  add column if not exists source_parser_version text;
alter table invoice_claim_field_sources
  add column if not exists source_page_text_sha256 text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='invoice_pdf_page_text_digest_chk'
  ) then
    alter table invoice_claim_field_sources add constraint
      invoice_pdf_page_text_digest_chk
      check (source_page_text_sha256 is null
        or source_page_text_sha256 ~ '^[0-9a-f]{64}$');
  end if;
end;
$$;

create unique index if not exists invoice_pdf_page_exact_source_fk_uq
  on invoice_pdf_source_pages(
    organization_id,artifact_id,parser_version,page_number,page_text_sha256
  );

do $$
begin
  if not exists (select 1 from pg_constraint
    where conname='invoice_pdf_field_page_source_fk') then
    alter table invoice_claim_field_sources
      add constraint invoice_pdf_field_page_source_fk
      foreign key(
        organization_id,artifact_id,source_parser_version,
        source_page,source_page_text_sha256
      ) references invoice_pdf_source_pages(
        organization_id,artifact_id,parser_version,page_number,page_text_sha256
      );
  end if;
end;
$$;

-- T2 assertions for PDF_TEXT cannot evade the page-origin FK by omitting its
-- nullable component columns. Other unverified kinds remain non-authorizing.
create or replace function require_parser_backed_pdf_claim_fields()
returns trigger language plpgsql as $$
declare k text;
begin
  select c.source_kind into k from invoice_verified_claim_sets c
    where c.id=new.claim_set_id
      and c.organization_id=new.organization_id
      and c.artifact_id=new.artifact_id;
  if new.trust_tier=2 and k='PDF_TEXT'
     and (new.source_parser_version is null
       or new.source_page_text_sha256 is null
       or new.source_page is null) then
    raise exception 'PDF_FIELD_PAGE_SOURCE_REQUIRED';
  end if;
  return new;
end;
$$;
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname='invoice_pdf_field_source_required'
      and tgrelid='invoice_claim_field_sources'::regclass
  ) then
    create trigger invoice_pdf_field_source_required
      before insert on invoice_claim_field_sources
      for each row execute function require_parser_backed_pdf_claim_fields();
  end if;
end;
$$;

create unique index if not exists invoice_verified_pdf_claim_replay_uq
  on invoice_verified_claim_sets(
    organization_id,artifact_id,snapshot_sha256
  )
  where source_kind='PDF_TEXT' and verification_status='VERIFIED';
