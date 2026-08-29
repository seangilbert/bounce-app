"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkle,
  Flag,
  Warning,
  CheckCircle,
  EnvelopeSimple,
  ChatText,
  CaretDown,
  CaretLeft,
  CurrencyDollar,
  Globe,
  PaperPlaneTilt,
  CircleNotch,
  ArrowSquareOut,
  Prohibit,
} from "@phosphor-icons/react/dist/ssr";
import type {
  InquiryListItem,
  InquiryStatus,
  InquiryOwner,
  InquiryDetail,
  ThreadMsg,
  BookingOutcome,
  QuoteSummary,
} from "@/lib/operator/inquiries";
import {
  replyInquiryAction,
  dismissInquiryAction,
  sendInquirySmsAction,
  takeOverInquiryAction,
  handBackInquiryAction,
  draftReplyAction,
} from "@/app/(operator)/inquiries/actions";
import { BookingBuilder } from "@/components/operator/bookings/BookingBuilder";
import { useInboxRealtime } from "./useInboxRealtime";
import { mergeThread } from "./live-thread";

interface InquiriesProps {
  list: InquiryListItem[];
  details: Record<string, InquiryDetail>;
  filters: { all: number; needsYou: number; ai: number; mine: number };
  operatorId: string;
  smsEnabled: boolean;
}

/** The handoff chip: who answers this thread right now. */
const OWNER: Record<InquiryOwner, { label: string; cls: string }> = {
  ai: { label: "AI handling", cls: "bg-teal-tint text-teal-deep" },
  needs_human: { label: "Needs you", cls: "bg-brand-tint text-brand-deep" },
  human: { label: "You own this", cls: "bg-sand text-ink-soft" },
};

const STATUS: Record<
  InquiryStatus,
  { label: string; icon: typeof Flag; text: string; avatar: string }
> = {
  needs_review: {
    label: "NEEDS YOUR REVIEW",
    icon: Flag,
    text: "text-brand-deep",
    avatar: "bg-brand-tint text-brand-deep",
  },
  escalated: {
    label: "ESCALATED",
    icon: Warning,
    text: "text-amber-deep",
    avatar: "bg-amber-tint text-amber-deep",
  },
  auto: {
    label: "AUTO-ANSWERED",
    icon: CheckCircle,
    text: "text-teal-deep",
    avatar: "bg-sand text-ink-soft",
  },
  replied: {
    label: "REPLIED",
    icon: PaperPlaneTilt,
    text: "text-teal-deep",
    avatar: "bg-teal-tint text-teal-deep",
  },
};

export function InquiriesView({ list, details, filters, operatorId, smsEnabled }: InquiriesProps) {
  const initial = list.find((i) => i.owner === "needs_human") ?? list[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [filter, setFilter] = useState<"all" | "needsYou" | "ai" | "mine">("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [deliverBy, setDeliverBy] = useState<"email" | "sms">("email");
  const [smsPhone, setSmsPhone] = useState("");
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<null | "send" | "dismiss" | "owner" | "draft">(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const selected = list.find((i) => i.id === selectedId) ?? list[0];
  const detail = selected ? details[selected.id] : undefined;
  const { overlay, unreadIds, markRead } = useInboxRealtime({
    operatorId,
    selectedId: selected?.id ?? "",
    details,
  });
  const shown = list.filter((i) =>
    filter === "all"
      ? true
      : filter === "needsYou"
        ? i.owner === "needs_human"
        : filter === "mine"
          ? i.owner === "human"
          : i.owner === "ai",
  );

  // The composer is for follow-up conversation now (the AI draft feeds the quote
  // builder instead), so clear it when switching inquiries. Default the delivery
  // channel to text when this is already an SMS thread (or a phone's on file).
  useEffect(() => {
    setReply("");
    const d = details[selectedId];
    setSmsPhone(d?.phone ?? "");
    setDeliverBy(smsEnabled && (d?.channel === "sms" || d?.phone) ? "sms" : "email");
    // Intentionally keyed on selectedId only: `details` gets a new object
    // identity on every router.refresh(), and the live inbox refreshes in the
    // background constantly — resetting then would wipe a half-typed reply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const open = (id: string) => {
    setSelectedId(id);
    setMobileDetail(true);
    markRead(id);
  };

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy("send");
    setActionErr(null);
    const res =
      deliverBy === "sms"
        ? await sendInquirySmsAction(selected.id, smsPhone, reply)
        : await replyInquiryAction(selected.id, reply);
    if (res.ok) {
      setReply("");
      router.refresh();
      setBusy(null);
    } else {
      setActionErr(res.error);
      setBusy(null);
    }
  }

  async function dismiss() {
    if (!selected) return;
    setBusy("dismiss");
    setActionErr(null);
    const res = await dismissInquiryAction(selected.id);
    if (res.ok) {
      router.refresh();
      setBusy(null);
    } else {
      setActionErr(res.error);
      setBusy(null);
    }
  }

  async function flipOwner(toHuman: boolean) {
    if (!selected) return;
    setBusy("owner");
    setActionErr(null);
    const res = toHuman
      ? await takeOverInquiryAction(selected.id)
      : await handBackInquiryAction(selected.id);
    if (res.ok) router.refresh();
    else setActionErr(res.error);
    setBusy(null);
  }

  async function draftReply() {
    if (!selected) return;
    setBusy("draft");
    setActionErr(null);
    const res = await draftReplyAction(selected.id);
    if (res.ok) setReply(res.draft);
    else setActionErr(res.error);
    setBusy(null);
  }

  if (!selected || !detail) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8 text-sm font-medium text-ink-mute">
        No inquiries yet.
      </div>
    );
  }

  const thread = mergeThread(detail.thread, overlay.get(selected.id) ?? []);
  // The stored AI quote, slotted right after the AI's last message so it stays
  // in time sequence. Only for legacy threads whose AI messages predate
  // per-message quote cards — hidden once any AI message carries its own card,
  // and while needs_review shows the draft card instead.
  const lastAiIdx = thread.reduce((last, m, i) => (m.sender === "ai" ? i : last), -1);
  const showQuoteWell =
    !!detail.quote && !detail.aiDraft && !thread.some((m) => m.sender === "ai" && m.quote);
  const quoteWellAfter = showQuoteWell ? (lastAiIdx === -1 ? thread.length - 1 : lastAiIdx) : -2;

  return (
    <div className="lg:flex lg:h-dvh lg:overflow-hidden">
      {/* ── Inbox list ── */}
      <section
        className={`${mobileDetail ? "hidden" : "flex"} w-full flex-col lg:flex lg:h-dvh lg:w-[400px] lg:flex-shrink-0 lg:border-r lg:border-sand`}
      >
        <div className="border-b border-sand px-6 pb-4 pt-6">
          <h1 className="font-display text-2xl font-bold text-ink">Inquiries</h1>
          <div className="mt-4 flex gap-2">
            <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
              All {filters.all}
            </FilterPill>
            <FilterPill active={filter === "needsYou"} tone="blue" onClick={() => setFilter("needsYou")}>
              Needs you {filters.needsYou}
            </FilterPill>
            <FilterPill active={filter === "ai"} tone="green" onClick={() => setFilter("ai")}>
              AI {filters.ai}
            </FilterPill>
            <FilterPill active={filter === "mine"} onClick={() => setFilter("mine")}>
              Mine {filters.mine}
            </FilterPill>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {shown.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm font-medium text-ink-mute">
              No{" "}
              {filter === "needsYou"
                ? "inquiries need you"
                : filter === "ai"
                  ? "AI-handled inquiries"
                  : filter === "mine"
                    ? "inquiries you've taken over"
                    : "inquiries"}{" "}
              right now.
            </p>
          ) : (
            shown.map((item) => (
              <InquiryCard
                key={item.id}
                item={item}
                active={item.id === selectedId}
                unread={unreadIds.has(item.id)}
                onClick={() => open(item.id)}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Detail ── */}
      <section
        className={`${mobileDetail ? "flex" : "hidden"} w-full flex-col lg:flex lg:h-dvh lg:flex-1`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-sand px-5 py-4 lg:px-8 lg:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="text-ink-soft lg:hidden"
              onClick={() => setMobileDetail(false)}
              aria-label="Back"
            >
              <CaretLeft size={22} weight="bold" />
            </button>
            <span
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl font-display text-[15px] font-extrabold ${STATUS[selected.status].avatar}`}
            >
              {selected.initials}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-display text-xl font-bold text-ink">{selected.name}</span>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide ${OWNER[detail.owner].cls}`}
                >
                  {OWNER[detail.owner].label.toUpperCase()}
                </span>
              </div>
              <div className="truncate text-sm font-medium text-ink-mute">
                {selected.customerType} · {selected.location}
              </div>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2.5">
            {detail.owner === "human" ? (
              <button
                onClick={() => flipOwner(false)}
                disabled={busy !== null}
                title="The AI resumes answering this customer"
                className="flex items-center gap-2 rounded-full border border-sand bg-white px-4 py-2 text-sm font-bold text-ink-soft transition-colors hover:bg-sand disabled:opacity-50"
              >
                {busy === "owner" ? (
                  <CircleNotch size={15} weight="bold" className="animate-spin" />
                ) : (
                  <Sparkle size={15} weight="fill" className="text-teal" />
                )}
                <span className="hidden sm:inline">Hand back to AI</span>
                <span className="sm:hidden">Hand back</span>
              </button>
            ) : (
              <button
                onClick={() => flipOwner(true)}
                disabled={busy !== null}
                title="Pause the AI — you answer this customer until you hand back"
                className="flex items-center gap-2 rounded-full border border-sand bg-white px-4 py-2 text-sm font-bold text-ink-soft transition-colors hover:bg-sand disabled:opacity-50"
              >
                {busy === "owner" ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : null}
                Take over
              </button>
            )}
            <button
              onClick={() => setBuilderOpen(true)}
              className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
            >
              <CurrencyDollar size={16} weight="fill" />
              <span className="hidden sm:inline">Create quote</span>
              <span className="sm:hidden">Quote</span>
            </button>
            {detail.email ? (
              <a
                href={`mailto:${detail.email}`}
                className="flex items-center gap-2 rounded-full border border-sand bg-white px-4 py-2 text-sm font-bold text-brand transition-colors hover:bg-brand-tint"
              >
                <EnvelopeSimple size={16} weight="fill" />
                <span className="hidden sm:inline">Email</span>
              </a>
            ) : null}
            <button
              onClick={dismiss}
              disabled={busy !== null}
              title="Dismiss this conversation — removes it from your inbox"
              className="flex items-center gap-2 rounded-full border border-sand bg-white px-4 py-2 text-sm font-bold text-ink-soft transition-colors hover:bg-coral-tint hover:text-coral-deep disabled:opacity-50"
            >
              {busy === "dismiss" ? (
                <CircleNotch size={15} weight="bold" className="animate-spin" />
              ) : (
                <Prohibit size={15} weight="bold" />
              )}
              <span className="hidden xl:inline">Dismiss</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-6 px-5 py-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-8">
          <OutcomeBanner outcome={detail.outcome} />

          {detail.whyBanner ? (
            <div className="flex gap-3 rounded-2xl bg-brand-tint px-4 py-4">
              <Sparkle size={18} weight="fill" className="mt-0.5 flex-shrink-0 text-brand" />
              <div>
                <div className="text-[15px] font-bold text-brand-deep">Why you&apos;re seeing this</div>
                <p className="mt-0.5 text-sm font-medium leading-snug text-brand-deep/85">
                  {detail.whyBanner}
                </p>
              </div>
            </div>
          ) : null}

          {/* Conversation thread */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
              Conversation
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {thread.map((m, i) => (
                <Fragment key={m.id}>
                  <ThreadBubble msg={m} />
                  {i === quoteWellAfter && detail.quote ? (
                    <QuoteWell key={selected.id} quote={detail.quote} />
                  ) : null}
                </Fragment>
              ))}
            </div>
          </div>

          {/* AI-drafted quote (needs_review) — the real response: review + send it. */}
          {detail.aiDraft ? (
            <div>
              <span className="flex items-center gap-1.5 text-sm font-bold text-brand">
                <Sparkle size={16} weight="fill" /> AI drafted a quote
              </span>
              <div className="mt-2.5 rounded-2xl border border-brand-ring bg-brand-tint/50 p-4">
                <div className="rounded-xl border border-sand-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-ink">{detail.aiDraft.match.name}</span>
                    <span className="flex-shrink-0 rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-brand-deep">
                      SUGGESTED MATCH
                    </span>
                  </div>
                  <div className="mt-3 flex gap-10">
                    <div>
                      <div className="text-xs font-semibold text-ink-mute">Availability</div>
                      <div className="mt-0.5 flex items-center gap-1.5 font-bold text-teal">
                        <CheckCircle size={16} weight="fill" />
                        {detail.aiDraft.match.availabilityLabel}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-ink-mute">Price</div>
                      <div className="mt-0.5 font-display text-base font-bold text-ink">
                        {detail.aiDraft.match.price}{" "}
                        <span className="text-sm font-medium text-ink-mute">
                          {detail.aiDraft.match.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setBuilderOpen(true)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
                >
                  <CurrencyDollar size={16} weight="fill" /> Review &amp; send quote
                </button>
                <p className="mt-1.5 text-center text-[12px] font-medium text-ink-mute">
                  Opens pre-filled — adjust items or send as-is with a pay link.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Reply composer — always available (persistent conversation). */}
        <div className="border-t border-sand px-5 py-4 lg:px-8 lg:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
                Your reply
              </span>
              <button
                onClick={draftReply}
                disabled={busy !== null}
                title="AI drafts a grounded reply — edit it before sending"
                className="flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-[12px] font-bold text-brand-deep transition-colors hover:bg-brand-tint/70 disabled:opacity-50"
              >
                {busy === "draft" ? (
                  <CircleNotch size={13} weight="bold" className="animate-spin" />
                ) : (
                  <Sparkle size={13} weight="fill" />
                )}
                Draft reply
              </button>
            </div>
            {smsEnabled ? (
              <div className="flex rounded-full bg-sand/70 p-0.5">
                {(["email", "sms"] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setDeliverBy(ch)}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      deliverBy === ch ? "bg-white text-ink shadow-sm" : "text-ink-soft"
                    }`}
                  >
                    {ch === "email" ? <EnvelopeSimple size={12} weight="fill" /> : <ChatText size={12} weight="fill" />}
                    {ch === "email" ? "Email" : "Text"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Where this reply goes on the chosen channel. */}
          {deliverBy === "sms" ? (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-sand bg-white px-3 py-2">
              <ChatText size={14} weight="fill" className="flex-shrink-0 text-brand" />
              <input
                type="tel"
                value={smsPhone}
                onChange={(e) => setSmsPhone(e.target.value)}
                placeholder="+15085551234"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-ink-faint"
              />
              <span className="flex-shrink-0 text-[11px] font-medium text-ink-mute">
                {detail.channel === "sms" ? "Texts the customer" : "Starts a text thread"}
              </span>
            </div>
          ) : detail.email ? (
            <div className="mt-2 flex items-center gap-1 text-xs font-medium text-ink-mute">
              <EnvelopeSimple size={12} weight="fill" /> Emails {detail.email}
            </div>
          ) : (
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-coral-tint/60 px-3.5 py-2.5 text-[13px] font-medium text-coral-deep">
              <Warning size={16} weight="fill" className="mt-0.5 flex-shrink-0" />
              <span>
                This customer didn&apos;t leave an email, so an email reply can&apos;t reach them.
                {smsEnabled
                  ? " Switch to Text to reach them by phone."
                  : " New inquiries now ask for an email when they need your review."}
              </span>
            </div>
          )}
          <div className="mt-2 rounded-2xl border-2 border-brand bg-white p-4">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              placeholder="Write a message to the customer…"
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
            />
            <div className="mt-3 flex items-center justify-end gap-2.5 border-t border-sand-line pt-3">
              <div className="flex gap-2.5">
                {reply ? (
                  <button
                    onClick={() => setReply("")}
                    disabled={busy !== null}
                    title="Clear this draft — nothing is sent"
                    className="flex items-center gap-2 rounded-full border border-sand bg-white px-4 py-2.5 text-sm font-bold text-ink-soft transition-colors hover:bg-sand disabled:opacity-50"
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  onClick={sendReply}
                  disabled={
                    busy !== null ||
                    !reply.trim() ||
                    (deliverBy === "sms" ? !smsPhone.trim() : !detail.email)
                  }
                  title={
                    deliverBy === "sms"
                      ? !smsPhone.trim()
                        ? "Enter the customer's phone to text them"
                        : undefined
                      : !detail.email
                        ? "No email on file to deliver to"
                        : undefined
                  }
                  className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
                >
                  {busy === "send" ? (
                    <CircleNotch size={16} weight="bold" className="animate-spin" />
                  ) : deliverBy === "sms" ? (
                    <ChatText size={16} weight="fill" />
                  ) : (
                    <PaperPlaneTilt size={16} weight="fill" />
                  )}
                  {deliverBy === "sms" ? "Text" : "Send"}
                </button>
              </div>
            </div>
            {actionErr ? (
              <p className="mt-2 text-[13px] font-semibold text-coral-deep">{actionErr}</p>
            ) : null}
          </div>
        </div>
      </section>

      {builderOpen ? (
        <BookingBuilder
          operatorId={operatorId}
          initial={{
            inquiryId: selected.id,
            customerName: detail.prefill.customerName ?? undefined,
            customerEmail: detail.prefill.customerEmail ?? undefined,
            startDate: detail.prefill.startDate,
            endDate: detail.prefill.endDate,
            items: detail.prefill.items,
            message: detail.aiDraft?.replyDraft,
          }}
          onClose={() => setBuilderOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Per-message channel chip; null/unknown channels render nothing (legacy rows). */
const CHANNEL_CHIP: Record<string, { label: string; Icon: typeof ChatText }> = {
  sms: { label: "Text", Icon: ChatText },
  email: { label: "Email", Icon: EnvelopeSimple },
  website: { label: "Web chat", Icon: Globe },
};

function ThreadBubble({ msg }: { msg: ThreadMsg }) {
  const isCustomer = msg.sender === "customer";
  const isAi = msg.sender === "ai";
  const chip = msg.channel ? CHANNEL_CHIP[msg.channel] : undefined;
  return (
    <div
      className={`max-w-[85%] ${msg.quote && !isAi ? "w-full sm:max-w-[400px]" : ""} ${isCustomer ? "self-start" : "ml-auto"}`}
    >
      {msg.quote && !isAi ? (
        // Operator-sent quote: the card IS the message (body is a plain-text fallback).
        <QuoteCard quote={msg.quote} label={`Quote sent · ${msg.quote.total}`} tone="operator" />
      ) : (
        <>
          <div
            className={`whitespace-pre-wrap px-5 py-3.5 text-[15px] leading-relaxed ${
              isCustomer
                ? "rounded-2xl rounded-tl-md border border-sand-line bg-white text-ink"
                : isAi
                  ? "rounded-2xl rounded-tr-md border border-brand-ring bg-brand-tint/50 text-ink"
                  : "rounded-2xl rounded-tr-md bg-brand text-white"
            }`}
          >
            {msg.body}
          </div>
          {/* AI turn that quoted: keep the reply text, attach its quote card. */}
          {msg.quote ? (
            <div className="mt-1.5">
              <QuoteCard quote={msg.quote} label={`AI quoted ${msg.quote.total}`} tone="ai" />
            </div>
          ) : null}
        </>
      )}
      <div className={`mt-1 text-xs font-medium text-ink-mute ${isCustomer ? "" : "text-right"}`}>
        {chip ? (
          <span className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-sand px-1.5 py-0.5 align-middle text-[10px] font-bold text-ink-soft">
            <chip.Icon size={10} weight="fill" /> {chip.label}
          </span>
        ) : null}
        {isAi ? "AI auto-answer · " : isCustomer ? "" : "You · "}
        {msg.time}
      </div>
    </div>
  );
}

/** Expandable quote card — collapsed to one line, expandable to the full
 *  line-item breakdown the customer's price was built from. tone "ai" is the
 *  tinted auto-quote well; "operator" is a quote you sent from the builder
 *  (solid header; shows your note + the pay link). */
function QuoteCard({
  quote,
  label,
  tone,
}: {
  quote: QuoteSummary;
  label: string;
  tone: "ai" | "operator";
}) {
  const [open, setOpen] = useState(false);
  const ai = tone === "ai";
  return (
    <div
      className={`overflow-hidden rounded-2xl rounded-tr-md border ${
        ai ? "border-brand-ring bg-brand-tint/50" : "border-brand"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
          ai ? "text-brand-deep hover:bg-brand-tint/70" : "bg-brand text-white hover:bg-brand-deep"
        }`}
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <CurrencyDollar size={16} weight="fill" />
          {label}
        </span>
        <span
          className={`flex flex-shrink-0 items-center gap-1 text-xs font-bold ${
            ai ? "text-ink-mute" : "text-white/80"
          }`}
        >
          {open ? "Hide" : "Details"}
          <CaretDown
            size={12}
            weight="bold"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open ? (
        <div className={`border-t bg-white px-4 py-3.5 ${ai ? "border-brand-ring/60" : "border-brand/30"}`}>
          {quote.note ? (
            <p className="mb-3 whitespace-pre-wrap border-b border-sand-line pb-3 text-sm leading-relaxed text-ink">
              {quote.note}
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            {quote.lines.map((l, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-ink">
                  {l.quantity > 1 ? `${l.quantity}× ` : ""}
                  {l.name}
                </span>
                <span className="flex-shrink-0 font-medium text-ink-soft">{l.lineTotal}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1 border-t border-sand-line pt-2.5 text-[13px] font-medium text-ink-soft">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{quote.subtotal}</span>
            </div>
            {quote.discount ? (
              <div className="flex justify-between text-teal-deep">
                <span>Discount</span>
                <span>−{quote.discount}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span>Delivery</span>
              <span className={quote.deliveryFee ? "" : "text-ink-mute"}>
                {quote.deliveryFee ?? "Added at checkout"}
              </span>
            </div>
            {quote.tax ? (
              <div className="flex justify-between">
                <span>Sales tax</span>
                <span>{quote.tax}</span>
              </div>
            ) : null}
            <div className="mt-0.5 flex justify-between text-sm font-bold text-ink">
              <span>Total</span>
              <span>{quote.total}</span>
            </div>
          </div>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-ink-mute">
            <span>
              {quote.eventDateLabel ? `For ${quote.eventDateLabel} · ` : ""}
              {quote.paymentType === "full"
                ? `pay link for the full ${quote.total}`
                : `deposit to book ${quote.deposit}`}
            </span>
            {quote.payUrl ? (
              <a
                href={quote.payUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-bold text-brand hover:text-brand-deep"
              >
                Payment link <ArrowSquareOut size={12} weight="bold" />
              </a>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The AI's auto-quote, shown as a well at the end of the thread. */
function QuoteWell({ quote }: { quote: QuoteSummary }) {
  return (
    <div className="ml-auto w-full max-w-[85%] sm:max-w-[400px]">
      <QuoteCard quote={quote} label={`AI quoted ${quote.total}`} tone="ai" />
    </div>
  );
}

function FilterPill({
  children,
  active,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  tone?: "blue" | "green";
  onClick?: () => void;
}) {
  const cls = active
    ? "bg-ink text-white"
    : tone === "blue"
      ? "bg-brand-tint text-brand-deep hover:bg-brand-tint/70"
      : tone === "green"
        ? "bg-teal-tint text-teal-deep hover:bg-teal-tint/70"
        : "text-ink-soft hover:bg-sand/60";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors ${cls}`}
    >
      {!active && tone === "blue" ? <span className="h-1.5 w-1.5 rounded-full bg-brand" /> : null}
      {!active && tone === "green" ? <CheckCircle size={13} weight="fill" /> : null}
      {children}
    </button>
  );
}

function InquiryCard({
  item,
  active,
  unread,
  onClick,
}: {
  item: InquiryListItem;
  active: boolean;
  unread?: boolean;
  onClick: () => void;
}) {
  const s = STATUS[item.status];
  const StatusIcon = s.icon;
  const border = active
    ? "border-2 border-brand bg-white shadow-[0_10px_24px_-16px_var(--brand-glow,rgba(59,125,240,0.5))]"
    : item.status === "escalated"
      ? "border border-amber-line border-l-[3px] border-l-amber bg-white"
      : "border border-sand-line bg-white";
  return (
    <button onClick={onClick} className={`w-full rounded-[18px] p-4 text-left transition ${border}`}>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl font-display text-[13px] font-extrabold ${s.avatar}`}
        >
          {item.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-extrabold text-ink">{item.name}</span>
            <span className="flex flex-shrink-0 items-center gap-1.5 text-xs font-medium text-ink-mute">
              {unread ? <span aria-label="New message" className="h-2 w-2 rounded-full bg-brand" /> : null}
              {item.time}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-extrabold tracking-[0.03em] ${s.text}`}
            >
              <StatusIcon size={10} weight="fill" />
              {s.label}
            </span>
            <OutcomeBadge outcome={item.outcome} />
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-[13px] font-medium leading-snug text-ink-soft">{item.preview}</p>
    </button>
  );
}

/** Compact conversion badge for the inbox list (shown only when there's an outcome). */
function OutcomeBadge({ outcome }: { outcome: BookingOutcome }) {
  if (outcome.status === "booked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-tint px-2 py-0.5 text-[10px] font-extrabold text-teal-deep">
        <CheckCircle size={10} weight="fill" /> BOOKED{outcome.amount ? ` · ${outcome.amount}` : ""}
      </span>
    );
  }
  if (outcome.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-tint px-2 py-0.5 text-[10px] font-extrabold text-amber-deep">
        CHECKOUT STARTED
      </span>
    );
  }
  if (outcome.status === "quoted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-extrabold text-brand-deep">
        <CurrencyDollar size={10} weight="fill" /> QUOTE SENT{outcome.amount ? ` · ${outcome.amount}` : ""}
      </span>
    );
  }
  if (outcome.status === "canceled") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-coral-tint px-2 py-0.5 text-[10px] font-extrabold text-coral-deep">
        <Prohibit size={10} weight="bold" /> CANCELED
      </span>
    );
  }
  return null;
}

/** Prominent conversion banner at the top of an inquiry's detail. */
function OutcomeBanner({ outcome }: { outcome: BookingOutcome }) {
  const base = "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3";
  const link = outcome.bookingId ? (
    <Link
      href={`/bookings/${outcome.bookingId}`}
      className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-sand bg-white px-3.5 py-1.5 text-[13px] font-bold text-ink-soft transition-colors hover:bg-sand/60"
    >
      <ArrowSquareOut size={14} weight="bold" /> Booking
    </Link>
  ) : null;

  if (outcome.status === "booked") {
    return (
      <div className={`${base} border-teal-line bg-teal-tint`}>
        <span className="flex items-center gap-2 text-[15px] font-bold text-teal-deep">
          <CheckCircle size={20} weight="fill" /> Booked
          {outcome.amount ? ` · ${outcome.amount}` : ""}
          {outcome.dateLabel ? ` · ${outcome.dateLabel}` : ""}
        </span>
        {link}
      </div>
    );
  }
  if (outcome.status === "pending") {
    return (
      <div className={`${base} border-amber-line bg-amber-tint`}>
        <span className="flex items-center gap-2 text-[15px] font-bold text-amber-deep">
          <CurrencyDollar size={20} weight="fill" /> Checkout started — not paid
          {outcome.amount ? ` · ${outcome.amount}` : ""}
        </span>
        {link}
      </div>
    );
  }
  if (outcome.status === "quoted") {
    return (
      <div className={`${base} border-brand-ring bg-brand-tint`}>
        <span className="flex items-center gap-2 text-[15px] font-bold text-brand-deep">
          <CurrencyDollar size={20} weight="fill" /> Quote sent — waiting on payment
          {outcome.amount ? ` · ${outcome.amount}` : ""}
          {outcome.dateLabel ? ` · ${outcome.dateLabel}` : ""}
        </span>
        {link}
      </div>
    );
  }
  if (outcome.status === "canceled") {
    return (
      <div className={`${base} border-coral-line bg-coral-tint`}>
        <span className="flex items-center gap-2 text-[15px] font-bold text-coral-deep">
          <Prohibit size={20} weight="bold" /> Booking canceled
        </span>
        {link}
      </div>
    );
  }
  return (
    <div className={`${base} border-sand-line bg-white`}>
      <span className="flex items-center gap-2 text-[15px] font-bold text-ink-soft">
        <Warning size={20} weight="fill" className="text-ink-faint" /> No booking yet
      </span>
    </div>
  );
}

