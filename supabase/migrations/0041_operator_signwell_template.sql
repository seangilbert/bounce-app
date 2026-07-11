-- Per-operator rental-agreement template. When set, the operator's own SignWell
-- template is used for their agreements instead of the platform default
-- (SIGNWELL_TEMPLATE_ID). Null = fall back to the platform template. This is the
-- data foundation for custom contracts (Phase B); the self-serve embedded editor
-- that populates it comes later.
alter table operators add column signwell_template_id text;
