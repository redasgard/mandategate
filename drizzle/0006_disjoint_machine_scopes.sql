-- Backstop: no stored machine identity may mix low-trust invoice processing
-- with privileged payment authority. Legacy invoice:submit grants neither.
alter table api_principals
  add constraint api_principals_disjoint_machine_scopes_chk
  check (
    not (
      (scopes ?| array['invoice:upload', 'invoice:analyze', 'invoice:read'])
      and
      (scopes ?| array['payment:submit', 'payment:read'])
    )
  );
