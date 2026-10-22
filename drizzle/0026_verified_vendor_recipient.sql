-- Vendor recipient approval is an accountable administrator decision based on
-- independent evidence, not a fabricated vendor-verification service.
-- Existing legacy records remain historically intact and distinguishable.
alter table vendor_reverification_resolutions
  add column if not exists verification_method text;

alter table vendor_reverification_resolutions
  drop constraint if exists vendor_reverification_resolutions_resolution_check;
alter table vendor_reverification_resolutions
  drop constraint if exists vendor_reverification_resolutions_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='vendor_reverification_resolutions'::regclass
      and conname='vendor_reverification_valid_resolution'
  ) then
    alter table vendor_reverification_resolutions
      add constraint vendor_reverification_valid_resolution
        check(resolution in ('REJECTED','SIMULATED_REVERIFIED','VERIFIED'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='vendor_reverification_resolutions'::regclass
      and conname='vendor_reverification_verified_method'
  ) then
    alter table vendor_reverification_resolutions
      add constraint vendor_reverification_verified_method
        check(
          resolution<>'VERIFIED' or
          verification_method in (
            'KNOWN_CONTACT_CALLBACK','TRUSTED_VENDOR_PORTAL',
            'SIGNED_VENDOR_INSTRUCTION'
          )
        );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='vendor_reverification_resolutions'::regclass
      and conname='vendor_reverification_destination_binding'
  ) then
    alter table vendor_reverification_resolutions
      add constraint vendor_reverification_destination_binding
        check(
          (resolution='REJECTED' and new_destination_id is null) or
          (resolution in ('SIMULATED_REVERIFIED','VERIFIED') and
           new_destination_id is not null)
        );
  end if;
end;
$$;
