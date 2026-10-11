-- PDF-derived vision observations retain both original artifact identity
-- and the exact locally rendered PNG input SHA. All values are untrusted T1.
-- ALTERs are safe on repeated migrator runs.
alter table invoice_image_observations
  add column if not exists rendered_input_sha256 text,
  add column if not exists rendered_page_number integer,
  add column if not exists rasterizer_version text;
