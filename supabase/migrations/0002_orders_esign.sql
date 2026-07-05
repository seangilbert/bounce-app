-- Track the e-signature agreement tied to an order.
--
-- An agreement is created+sent when an order is paid (gated by SIGNWELL_AUTO_SEND).
-- esign_document_id is the provider document id; esign_status tracks the
-- normalized signing lifecycle (sent → viewed → signed → completed, or
-- declined/expired/canceled).

alter table public.orders
  add column if not exists esign_document_id text,
  add column if not exists esign_status      text;

create index if not exists orders_esign_document_id_idx
  on public.orders (esign_document_id);
