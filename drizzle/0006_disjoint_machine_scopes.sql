-- Safe to rerun: the app executes every SQL migration on each startup.
-- No principal may carry both invoice-observer and payment authority.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'api_principals_disjoint_machine_scopes_chk'
      and conrelid = 'api_principals'::regclass
  ) then
    alter table api_principals
      add constraint api_principals_disjoint_machine_scopes_chk
      check (
        not (
          (scopes ?| array['invoice:upload', 'invoice:analyze', 'invoice:read'])
          and
          (scopes ?| array['payment:submit', 'payment:read'])
        )
      );
  end if;
end;
$$;
