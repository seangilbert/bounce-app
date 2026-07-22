-- Per-operator custom instructions for the AI quote assistant. Free-text guidance
-- the operator writes (tone, recommendations, upsells, house rules) that gets
-- injected into the assistant's system prompt for their inquiries. Optional; the
-- core assistant rules (no prices, never invent items, honor availability) always
-- take precedence over this text — see buildSystemPrompt in lib/llm/assistant.ts.
alter table operators
  add column assistant_instructions text;
