-- Store the operator's reply when they respond to an inquiry from the inbox.
-- Status moves to 'replied' (already an allowed value from 0006); replied_at
-- already exists. Actual delivery to the customer is via email (Resend) — a
-- follow-up; for now this records the reply and clears it from "needs you".

alter table public.inquiries add column if not exists operator_reply text;
