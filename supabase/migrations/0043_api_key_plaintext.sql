-- Publishable keys are designed to live in the browser (origin-restricted, low
-- privilege), so — like Stripe's pk_ keys — we keep them retrievable in the
-- dashboard so the operator can always copy their embed snippet. Secret keys
-- stay hashed-only (shown once). `plaintext` is NULL for secret keys.
alter table api_keys add column plaintext text;
