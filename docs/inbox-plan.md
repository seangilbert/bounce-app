# Unified AI Inbox — plan (2026-07-18)

**Vision:** one inbox that aggregates every channel a customer might use (web
chat, SMS, email, Facebook Messenger, WhatsApp, Instagram DM, …), where the AI
answers instantly so **a customer always gets a response**, and the **hand-off
between AI and a human operator is seamless** in both directions.

## What already exists (build on this, don't rebuild)

~60% of the spine is here:
- **Inbox UI** `/inquiries` — list + filters (All / Needs you / Auto), thread view, composer.
- **Model:** `inquiries` (`channel`, `status` ∈ needs_review/auto/replied/dismissed, `customer_id`/`email`/`phone`) + **`inquiry_messages`** (per-message `sender` ∈ customer/operator/ai). Threads persist.
- **AI brain** `handleInquiry` — grounded in live inventory/pricing; emits `gathering` / `quoted` / `review`; escalates on cap/unmatched/etc.
- **Channels live:** **web chat** + **SMS two-way** (Twilio webhook → route by phone → append → `handleInquiry` → reply). **Email is outbound-only.**
- **Channel-aware reply** — `replyInquiryAction` already delivers over SMS or email by thread.

**This plan = Inquiries "Phase 2/3" from the roadmap, expanded into the full vision.** It absorbs the already-listed items (inbound email, operator-takeover, cold inbound).

## The three hard problems

1. **Channel aggregation** — many inbound sources, many outbound sinks, one thread. (SMS webhook is the working template.)
2. **Identity across channels** — the same person may text, then email, then DM. One conversation/customer, many handles.
3. **AI↔human handoff** — the heart of it: always-respond, AI pauses when a human takes over, one-tap hand-back, AI as copilot throughout.

---

## Design

### 1. Channel abstraction (the key architectural investment)

One `Channel` interface + one **ingest pipeline**, so each new channel is a plugin, not a rewrite. Model each channel on the existing Twilio flow:

```
interface Channel {
  verify(req): boolean                      // signature/secret check
  parseInbound(payload): InboundMessage     // { externalUserId, text, attachments, channelMsgId }
  send(conversation, text): Promise<void>   // outbound on this channel
}
```

All inbound webhooks funnel into **one** `ingestInbound(channel, payload)`:
verify → dedupe (by channel message id) → **resolve/create conversation** by
(channel, externalUserId) + unified customer → append `customer` message →
**run the handoff/AI decision** → respond on the same channel.

Channels to implement against this: `sms` (done), `email-inbound`, `messenger`,
`whatsapp`, `instagram`, `web` (done). Each is ~the size of the Twilio webhook.

### 2. Conversation + identity model

Evolve "inquiry" into a **conversation** that can span channels and time. Minimal schema deltas on the existing model rather than a rewrite:
- `inquiries` (the conversation): add **`owner`** ∈ `ai` / `needs_human` / `human` (the handoff state — distinct from the lifecycle `status`), `last_customer_at`, `last_human_at`.
- `inquiry_messages`: add per-message **`channel`** + **`direction`** (a conversation can move across channels).
- **`channel_identities`** (new): `(customer_id | conversation_id, channel, external_id)` — phone (SMS/WhatsApp), email, Messenger PSID, IG IGSID. This is what merges "texter" and "emailer" into one person, and ties into the existing per-operator `customers` + platform `customer_accounts`.

Resolution: inbound → match `channel_identities` → existing conversation; else match a `customers` row by phone/email → attach; else create a new lightweight identity. (Reuses `upsertCustomer`.)

### 3. AI↔human handoff state machine (the heart)

**`owner` on the conversation drives everything:**

- **`ai`** — AI auto-responds to every inbound (current SMS/web behavior).
- **`needs_human`** — AI escalated (a `review` outcome). It has **already sent the customer a graceful acknowledgment** ("Thanks — a team member will follow up shortly with a custom quote"), so *nobody is left on read*, and it alerts the operator.
- **`human`** — an operator has taken over. **AI stops auto-sending**, but keeps **drafting suggested replies** the operator can send in one tap or edit (AI-as-copilot).

**Transitions:**
- **AI → needs_human:** on `review`, or on low confidence, or on keywords ("complaint", "cancel", "speak to someone").
- **Take over (needs_human/ai → human):** the operator sending a reply — or an explicit "Take over" button — flips `owner=human` and **pauses the AI** on that thread. This is the roadmap's "operator-takeover" rule.
- **Hand back (human → ai):** an explicit **"Hand back to AI"** button, or auto after resolution/inactivity. AI resumes auto-responding.

**Always-respond guarantee:** every inbound gets *something* fast — the AI's real answer (ai mode), or an AI acknowledgment if escalated/human-owned and no human has replied within N minutes. A background sweep (like `expireStaleCheckouts`) catches anything that slipped.

**AI-as-copilot everywhere:** even in `human` mode the AI drafts grounded suggestions (inventory, availability, this operator's policies), so the human is always assisted. This is what makes the hand-off feel seamless rather than a mode switch.

### 4. Unified inbox UX

- **One list, all channels** — per-message **channel badge** (📱 SMS, ✉️ email, 💬 Messenger, WhatsApp, IG), filters by channel + owner (Needs you / AI-handled / Mine).
- **Assignment** — who owns it (AI vs a specific team member); "Take over" / "Hand back to AI" controls.
- **AI suggestions inline** — a draft reply chip on every open thread; send-as-is or edit.
- **Real-time** — Supabase Realtime on `inquiry_messages`/`inquiries` so new messages appear live (today's inbox is static-render; a true inbox needs push).
- Later: canned replies, response-time/SLA surfacing, AI thread summary.

---

## Phasing (each phase shippable)

- **Phase 0 — Handoff foundations.** Add `owner` state + the state machine + always-respond acknowledgment + AI-copilot suggestions, on the **existing** web+SMS channels. *Makes what you already have seamless before adding channels.* Also add per-message `channel`/`direction`. **Highest value/effort ratio — do first.**
- **Phase 1 — Inbound email.** Plus-addressed reply-to (`inbox+<id>@movables.ai`) + a **Resend inbound webhook** → the ingest pipeline. Closes the email loop (outbound already works). *(Already the top Inquiries item.)*
- **Phase 2 — Identity + real-time + inbox UX.** `channel_identities` merge; Supabase Realtime; channel badges, assignment, inline AI suggestions.
- **Phase 3 — Meta channels: Messenger → WhatsApp → Instagram.** Each implements the Channel interface + webhook. **Heaviest — see the reality check below.** Do the one an operator's customers actually use most, first.
- **Phase 4 — Advanced.** Cold inbound (customer messages first, unprompted → per-operator numbers/pages), canned responses, routing to specific members, SLA metrics.

## Reality checks (the non-code cost)

- **Every channel has per-operator external setup**, not just code: SMS/WhatsApp = Twilio + **A2P/WhatsApp approval** (recurring fees, days-long); Messenger/IG = a **Meta app + per-operator OAuth** to their Facebook Page / IG account + Meta business verification. This is real onboarding friction and belongs in operator setup UX + the plan-gating story (likely Growing-plan).
- **WhatsApp's 24-hour window + template rules** — you can't freely message outside 24h of the customer's last message; requires pre-approved templates. Constrains "always-respond" on WhatsApp specifically.
- **Meta channels are per-Page/per-number**, so this is inherently multi-tenant connection management (like Stripe Connect for messaging).

## Key decisions (my recommendation in **bold**)

1. **AI autonomy default** — auto-respond-and-escalate (**recommended**, matches today's SMS/web) vs. draft-only-until-approved. Auto keeps the "always instant" promise; escalation + easy takeover is the safety valve.
2. **Channel priority after email** — **SMS + email are table stakes** (mostly done). For the rest, build the one the operator's customers use — for US party rentals that's often **Facebook Messenger** before WhatsApp. Recommend **Messenger next**, WhatsApp after.
3. **Build vs. buy** — **build native** (Twilio, Meta Graph, Resend) rather than an aggregator: you already own the SMS integration, aggregators add cost + a dependency, and the AI-grounding needs deep access. The Channel interface keeps it clean.
4. **Where handoff state lives** — evolve `inquiries` (**recommended**, minimal deltas, reuses everything) vs. a new `conversations` table (cleaner name, big refactor). Not worth the refactor now.

## Relationship to other work
- Absorbs roadmap items: *Inquiries Phase 2 (inbound email)*, *operator-takeover*, *cold inbound*.
- Pairs with **RLS** (these are the most PII-heavy tables — do RLS Phase 2 before broad multi-operator inbox use).
- **Realtime** is new infra (Supabase Realtime) — first use in the app.
