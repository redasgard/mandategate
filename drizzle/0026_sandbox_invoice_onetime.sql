-- One fictional invoice-derived PayPal Sandbox request per demo tenant.
-- No production or payment-provider configuration is changed by this index.
-- This protects against separate approved bindings with a new logical payment
-- ID attempting to pay the same exact hackathon test invoice twice.
create unique index if not exists sandbox_demo_invoice_one_shot_uq
  on payment_requests (organization_id, invoice_number)
  where organization_id='org_demo'
    and invoice_number='MG-SANDBOX-101-2026'
    and source='verified_invoice';
