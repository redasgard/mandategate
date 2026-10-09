-- Prevent replaying the same human enrollment assertion as a new trusted
-- channel. Revoked identity/evidence cannot be recycled under a fresh ID.
create unique index if not exists vendor_origin_channels_enrollment_digest_uq
  on vendor_origin_channels (
    organization_id, vendor_id, kind, enrolled_evidence_sha256
  );
