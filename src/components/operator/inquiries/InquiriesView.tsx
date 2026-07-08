"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkle,
  Flag,
  Warning,
  CheckCircle,
  EnvelopeSimple,
  CaretLeft,
  CurrencyDollar,
  PaperPlaneTilt,
  CircleNotch,
  ArrowSquareOut,
  Prohibit,
} from "@phosphor-icons/react/dist/ssr";
import type {
  InquiryListItem,
  InquiryStatus,
  InquiryDetail,
  ThreadMsg,
  BookingOutcome,
} from "@/lib/operator/inquiries";
import { replyInquiryAction, dismissInquiryAction } from "@/app/(operator)/inquiries/actions";

interface InquiriesProps {
  list: InquiryListItem[];
  details: Record<string, InquiryDetail>;
  filters: { all: number; needsYou: number; auto: number };
}

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

export function InquiriesView({ list, details, filters }: InquiriesProps) {
  const initial = list.find((i) => i.status === "needs_review") ?? list[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [filter, setFilter] = useState<"all" | "needsYou" | "auto">("all");
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<null | "send" | "dismiss">(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const selected = list.find((i) => i.id === selectedId) ?? list[0];
  const detail = selected ? details[selected.id] : undefined;
  const shown = list.filter((i) =>
    filter === "all" ? true : filter === "needsYou" ? i.status === "needs_review" : i.status !== "needs_review",
  );

  // On switching inquiries (or after a refresh), seed the composer with the AI
  // draft if this inquiry still has an unsent one, else leave it empty.
  useEffect(() => {
    setReply(details[selectedId]?.aiDraft?.replyDraft ?? "");
  }, [selectedId, details]);

  const open = (id: string) => {
    setSelectedId(id);
    setMobileDetail(true);
  };

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy("send");
    setActionErr(null);
    const res = await replyInquiryAction(selected.id, reply);
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

  if (!selected || !detail) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8 text-sm font-medium text-ink-mute">
        No inquiries yet.
      </div>
    );
  }

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
            <FilterPill active={filter === "auto"} tone="green" onClick={() => setFilter("auto")}>
              Auto {filters.auto}
            </FilterPill>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {shown.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm font-medium text-ink-mute">
              No {filter === "needsYou" ? "inquiries need you" : filter === "auto" ? "auto-handled inquiries" : "inquiries"} right now.
            </p>
          ) : (
            shown.map((item) => (
              <InquiryCard
                key={item.id}
                item={item}
                active={item.id === selectedId}
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
              <div className="truncate font-display text-xl font-bold text-ink">{selected.name}</div>
              <div className="truncate text-sm font-medium text-ink-mute">
                {selected.customerType} · {selected.location}
              </div>
            </div>
          </div>
          {detail.email ? (
            <a
              href={`mailto:${detail.email}`}
              className="flex flex-shrink-0 items-center gap-2 rounded-full border border-sand bg-white px-4 py-2 text-sm font-bold text-brand transition-colors hover:bg-brand-tint"
            >
              <EnvelopeSimple size={16} weight="fill" /> Email
            </a>
          ) : null}
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
              {detail.thread.map((m) => (
                <ThreadBubble key={m.id} msg={m} />
              ))}
            </div>
          </div>

          {/* AI suggestion (needs_review only) — its text pre-fills the composer. */}
          {detail.aiDraft ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-bold text-brand">
                  <Sparkle size={16} weight="fill" /> AI suggested a reply
                </span>
                <span className="rounded-full bg-amber-tint px-2.5 py-1 text-[11px] font-extrabold text-amber-deep">
                  IN YOUR COMPOSER
                </span>
              </div>
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
              </div>
            </div>
          ) : null}
        </div>

        {/* Reply composer — always available (persistent conversation). */}
        <div className="border-t border-sand px-5 py-4 lg:px-8 lg:py-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
              Your reply
            </span>
            {detail.aiDraft ? (
              <span className="text-xs font-medium text-ink-mute">AI-drafted · edit anything</span>
            ) : null}
          </div>
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
                <button
                  onClick={dismiss}
                  disabled={busy !== null}
                  className="flex items-center gap-2 rounded-full border border-sand bg-white px-4 py-2.5 text-sm font-bold text-ink-soft transition-colors hover:bg-sand disabled:opacity-50"
                >
                  {busy === "dismiss" ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : null}
                  Dismiss
                </button>
                <button
                  onClick={sendReply}
                  disabled={busy !== null || !reply.trim()}
                  className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
                >
                  {busy === "send" ? (
                    <CircleNotch size={16} weight="bold" className="animate-spin" />
                  ) : (
                    <PaperPlaneTilt size={16} weight="fill" />
                  )}
                  Send
                </button>
              </div>
            </div>
            {actionErr ? (
              <p className="mt-2 text-[13px] font-semibold text-coral-deep">{actionErr}</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function ThreadBubble({ msg }: { msg: ThreadMsg }) {
  const isCustomer = msg.sender === "customer";
  const isAi = msg.sender === "ai";
  return (
    <div className={`max-w-[85%] ${isCustomer ? "self-start" : "ml-auto"}`}>
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
      <div className={`mt-1 text-xs font-medium text-ink-mute ${isCustomer ? "" : "text-right"}`}>
        {isAi ? "AI auto-answer · " : isCustomer ? "" : "You · "}
        {msg.time}
      </div>
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
  onClick,
}: {
  item: InquiryListItem;
  active: boolean;
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
            <span className="flex-shrink-0 text-xs font-medium text-ink-mute">{item.time}</span>
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

