"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SlidersHorizontal,
  Sparkle,
  Flag,
  Warning,
  CheckCircle,
  Phone,
  ChatText,
  CaretLeft,
  CurrencyDollar,
  CalendarBlank,
  Paperclip,
  PaperPlaneTilt,
  CircleNotch,
} from "@phosphor-icons/react/dist/ssr";
import type { InquiryListItem, InquiryStatus, InquiryDetail } from "@/lib/operator/inquiries";
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
  const router = useRouter();
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState<null | "send" | "dismiss">(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const selected = list.find((i) => i.id === selectedId) ?? list[0];
  const detail = selected ? details[selected.id] : undefined;

  const open = (id: string) => {
    setSelectedId(id);
    setMobileDetail(true);
  };

  async function sendReply() {
    if (!selected) return;
    setBusy("send");
    setActionErr(null);
    const res = await replyInquiryAction(selected.id, replyRef.current?.value ?? "");
    if (res.ok) {
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
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold text-ink">Inquiries</h1>
            <button className="text-ink-soft" aria-label="Filters">
              <SlidersHorizontal size={20} />
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <FilterPill active>All {filters.all}</FilterPill>
            <FilterPill tone="blue">Needs you {filters.needsYou}</FilterPill>
            <FilterPill tone="green">Auto {filters.auto}</FilterPill>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {list.map((item) => (
            <InquiryCard
              key={item.id}
              item={item}
              active={item.id === selectedId}
              onClick={() => open(item.id)}
            />
          ))}
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
          <div className="flex flex-shrink-0 gap-2.5">
            <HeaderAction icon={Phone}>Call</HeaderAction>
            <HeaderAction icon={ChatText}>Text</HeaderAction>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-6 px-5 py-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-8">
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

          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
              Conversation
            </div>
            <div className="mt-3 max-w-[85%]">
              <div className="rounded-2xl rounded-tl-md border border-sand-line bg-white px-5 py-4 text-[15px] leading-relaxed text-ink">
                {detail.message.text}
              </div>
              <div className="mt-1.5 text-xs font-medium text-ink-mute">{detail.message.meta}</div>
            </div>
          </div>

          {detail.aiDraft ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-bold text-brand">
                  <Sparkle size={16} weight="fill" /> AI drafted a reply
                </span>
                <span className="rounded-full bg-amber-tint px-2.5 py-1 text-[11px] font-extrabold text-amber-deep">
                  NOT SENT YET
                </span>
              </div>
              <div className="ml-auto mt-2.5 max-w-[85%] rounded-2xl rounded-tr-md border border-brand-ring bg-brand-tint/50 p-4">
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
                <p className="mt-3 text-[15px] leading-relaxed text-ink">{detail.aiDraft.message}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-teal-line bg-teal-tint px-4 py-4">
              <CheckCircle size={22} weight="fill" className="flex-shrink-0 text-teal" />
              <div>
                <div className="text-[15px] font-bold text-ink">Auto-answered</div>
                <p className="mt-0.5 text-sm font-medium text-ink-soft">{detail.handledNote}</p>
              </div>
            </div>
          )}
        </div>

        {/* Reply composer */}
        {detail.aiDraft ? (
          <div className="border-t border-sand px-5 py-4 lg:px-8 lg:py-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
                Your reply
              </span>
              <span className="text-xs font-medium text-ink-mute">AI-drafted · edit anything</span>
            </div>
            <div className="mt-2 rounded-2xl border-2 border-brand bg-white p-4">
              <textarea
                key={selectedId}
                ref={replyRef}
                defaultValue={detail.aiDraft.replyDraft}
                rows={2}
                className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-sand-line pt-3">
                <div className="flex flex-wrap gap-2">
                  <ComposerChip icon={CurrencyDollar}>Change quote</ComposerChip>
                  <ComposerChip icon={CalendarBlank}>Offer date</ComposerChip>
                  <ComposerChip icon={Paperclip}>Attach photo</ComposerChip>
                </div>
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
                    disabled={busy !== null}
                    className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
                  >
                    {busy === "send" ? (
                      <CircleNotch size={16} weight="bold" className="animate-spin" />
                    ) : (
                      <PaperPlaneTilt size={16} weight="fill" />
                    )}
                    Send reply
                  </button>
                </div>
              </div>
              {actionErr ? (
                <p className="mt-2 text-[13px] font-semibold text-coral-deep">{actionErr}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FilterPill({
  children,
  active,
  tone,
}: {
  children: React.ReactNode;
  active?: boolean;
  tone?: "blue" | "green";
}) {
  if (active) {
    return (
      <span className="rounded-full bg-ink px-3.5 py-2 text-[13px] font-bold text-white">
        {children}
      </span>
    );
  }
  const cls =
    tone === "blue"
      ? "bg-brand-tint text-brand-deep"
      : tone === "green"
        ? "bg-teal-tint text-teal-deep"
        : "text-ink-soft";
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold ${cls}`}>
      {tone === "blue" ? <span className="h-1.5 w-1.5 rounded-full bg-brand" /> : null}
      {tone === "green" ? <CheckCircle size={13} weight="fill" /> : null}
      {children}
    </span>
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
    ? "border-2 border-brand bg-white shadow-[0_10px_24px_-16px_rgba(59,125,240,0.5)]"
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
          <span
            className={`mt-1 inline-flex items-center gap-1 text-[10px] font-extrabold tracking-[0.03em] ${s.text}`}
          >
            <StatusIcon size={10} weight="fill" />
            {s.label}
          </span>
        </div>
      </div>
      <p className="mt-2.5 text-[13px] font-medium leading-snug text-ink-soft">{item.preview}</p>
    </button>
  );
}

function HeaderAction({
  icon: Icon,
  children,
}: {
  icon: typeof Phone;
  children: React.ReactNode;
}) {
  return (
    <button className="flex items-center gap-2 rounded-full border border-sand bg-white px-4 py-2 text-sm font-bold text-brand transition-colors hover:bg-brand-tint">
      <Icon size={16} weight="fill" />
      {children}
    </button>
  );
}

function ComposerChip({
  icon: Icon,
  children,
}: {
  icon: typeof CurrencyDollar;
  children: React.ReactNode;
}) {
  return (
    <button className="flex items-center gap-1.5 rounded-full bg-sand/60 px-3 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:bg-sand">
      <Icon size={15} />
      {children}
    </button>
  );
}
