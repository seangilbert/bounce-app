-- Per-operator contract identity. Today the rental agreement's counterparty +
-- countersigner come from platform env vars (SIGNWELL_SENDER_*), so every
-- operator's customers sign paperwork branded to the platform. These columns let
-- each operator be the party named on and signing their own agreements.
--   * business_address    — the operator's legal/mailing address for the contract body
--   * esign_signer_name    — optional countersigner name  (falls back to name in code)
--   * esign_signer_email   — optional countersigner email (falls back to contact_email)
alter table operators
  add column business_address text,
  add column esign_signer_name text,
  add column esign_signer_email text;
