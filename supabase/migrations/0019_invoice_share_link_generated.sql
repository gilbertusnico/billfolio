ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS share_link_generated_at timestamptz;

COMMENT ON COLUMN invoices.share_link_generated_at IS 'When the user last generated a public share link for this invoice; used to keep the share panel visible across visits.';
