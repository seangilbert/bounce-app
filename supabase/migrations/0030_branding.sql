-- Storefront branding copy. brand_color + logo_url already exist; this adds the
-- editable headline (tagline) and about blurb shown on the storefront hero.
alter table operators
  add column tagline text,
  add column about text;
