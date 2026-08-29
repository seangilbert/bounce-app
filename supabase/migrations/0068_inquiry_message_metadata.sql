-- Structured payload on a thread message. First use: the quote an operator
-- sends from the builder ({ kind: 'quote', lines, totals, payUrl, ... }) so the
-- inbox can render it as a quote card in the conversation. Null for plain
-- messages.
alter table public.inquiry_messages
  add column if not exists metadata jsonb;
