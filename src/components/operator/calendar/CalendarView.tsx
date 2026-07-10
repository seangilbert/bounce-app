"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CaretLeft,
  CaretRight,
  LockSimple,
  Prohibit,
  CastleTurret,
  SealCheck,
  ClockCountdown,
  ArrowSquareOut,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { NewBookingButton } from "@/components/operator/bookings/NewBookingButton";
import {
  weekdays,
  calFilters,
  type CalDayData,
  type CalEvent,
  type CalendarData,
  type ItemCategory,
  type SelectedBooking,
  type SelectedDayDetail,
} from "@/lib/operator/calendar";

const CAT_BG: Record<ItemCategory, string> = {
  bounce: "bg-brand",
  tent: "bg-teal",
  tables: "bg-amber",
};

const MONTH_CAP = 2; // pills shown per day in month view before "+N more"

export function CalendarView({ data, operatorId }: { data: CalendarData; operatorId: string }) {
  const [view, setView] = useState<"month" | "week">("month");
  const [selectedIso, setSelectedIso] = useState<string | null>(data.defaultSelectedIso);

  // Fall back to the default day when the selection isn't in the current month
  // (e.g. after navigating months) so the panel always has a valid day.
  const active =
    data.days.find((d) => d.iso === selectedIso) ??
    data.days.find((d) => d.iso === data.defaultSelectedIso) ??
    null;

  const catSuffix = data.category !== "all" ? `&cat=${data.category}` : "";
  const monthHref = (y: number, m: number) => `/calendar?y=${y}&m=${m}${catSuffix}`;
  const prev = data.month === 1 ? { y: data.year - 1, m: 12 } : { y: data.year, m: data.month - 1 };
  const next = data.month === 12 ? { y: data.year + 1, m: 1 } : { y: data.year, m: data.month + 1 };
  const [todayY, todayM] = data.todayIso.split("-").map(Number);

  // Week view: the 7 days sharing a grid row with the active day.
  const activeIdx = active ? data.days.findIndex((d) => d.iso === active.iso) : -1;
  const weekStart = activeIdx >= 0 ? Math.floor(activeIdx / 7) * 7 : 0;
  const weekDays = data.days.slice(weekStart, weekStart + 7);

  const activeFilter = calFilters.find((f) => f.cat === data.category);

  return (
    <div className="lg:flex lg:h-dvh lg:overflow-hidden">
      {/* Calendar */}
      <div className="flex min-w-0 flex-1 flex-col lg:h-dvh">
        {/* Top bar */}
        <div className="flex flex-col gap-3 border-b border-sand px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-8 lg:py-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-ink lg:text-[28px]">{data.monthLabel}</h1>
            <div className="flex gap-1.5">
              <NavBtn href={monthHref(prev.y, prev.m)} label="Previous month">
                <CaretLeft size={16} weight="bold" />
              </NavBtn>
              <NavBtn href={monthHref(next.y, next.m)} label="Next month">
                <CaretRight size={16} weight="bold" />
              </NavBtn>
            </div>
            <Link href={monthHref(todayY, todayM)} className="text-sm font-bold text-brand hover:text-brand-deep">
              Today
            </Link>
            {activeFilter && data.category !== "all" ? (
              <Link
                href={monthHref(data.year, data.month).replace(catSuffix, "")}
                className="flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-bold text-brand-deep"
              >
                <span className={`h-2 w-2 rounded-full ${activeFilter.dot}`} />
                {activeFilter.label}
                <X size={12} weight="bold" />
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-full bg-sand/70 p-1">
              {(["week", "month"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold capitalize transition-colors ${
                    view === v ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <NewBookingButton
              operatorId={operatorId}
              initialDate={active?.iso}
              className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-deep"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-3 lg:min-h-0 lg:p-6">
          <div className="grid grid-cols-7 gap-1.5 pb-2 lg:gap-2">
            {weekdays.map((w) => (
              <div key={w} className="px-1 text-[11px] font-bold tracking-wide text-ink-faint">
                {w}
              </div>
            ))}
          </div>
          {view === "month" ? (
            <div className="grid grid-cols-7 gap-1.5 lg:gap-2">
              {data.days.map((day) => (
                <DayCell
                  key={day.iso}
                  day={day}
                  selected={active?.iso === day.iso}
                  today={day.iso === data.todayIso}
                  onSelect={() => setSelectedIso(day.iso)}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5 lg:gap-2">
              {weekDays.map((day) => (
                <WeekColumn
                  key={day.iso}
                  day={day}
                  selected={active?.iso === day.iso}
                  today={day.iso === data.todayIso}
                  onSelect={() => setSelectedIso(day.iso)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <aside className="border-t border-sand p-5 lg:h-dvh lg:w-[360px] lg:flex-shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
        <DetailPanel detail={active?.detail ?? null} blackout={!!active?.blackout} closed={!!active?.closed} />
      </aside>
    </div>
  );
}

function NavBtn({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand bg-white text-ink-soft transition-colors hover:bg-sand/50"
    >
      {children}
    </Link>
  );
}

function EventPill({ event }: { event: CalEvent }) {
  return (
    <Link
      href={`/bookings/${event.bookingId}`}
      onClick={(e) => e.stopPropagation()}
      className={`block truncate rounded-md px-2 py-1 text-[11px] font-bold text-white transition-opacity hover:opacity-90 ${CAT_BG[event.category]}`}
      title={event.label}
    >
      {event.label}
    </Link>
  );
}

function DayCell({
  day,
  selected,
  today,
  onSelect,
}: {
  day: CalDayData;
  selected: boolean;
  today: boolean;
  onSelect: () => void;
}) {
  const fb = day.fullyBooked;
  const shell = selected
    ? "border-2 border-coral bg-coral-tint/50"
    : day.blackout
      ? "border border-sand bg-sand/50"
      : fb
        ? "border border-coral bg-coral-tint/40"
        : day.closed
          ? "border border-transparent bg-sand/25"
          : day.inMonth
            ? "border border-sand-line bg-white hover:border-sand"
            : "border border-transparent bg-sand/20";
  const shown = day.events.slice(0, MONTH_CAP);
  const more = day.events.length - shown.length;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex min-h-[64px] cursor-pointer flex-col rounded-xl p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-ring lg:min-h-[140px] lg:p-2 ${shell}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold ${
            today ? "bg-brand text-white" : fb ? "text-coral-deep" : day.inMonth ? "text-ink" : "text-ink-faint"
          }`}
        >
          {day.dayNum}
        </span>
        {day.blackout ? (
          <Prohibit size={12} weight="bold" className="text-ink-mute" />
        ) : fb ? (
          <LockSimple size={12} weight="fill" className="text-coral-deep" />
        ) : null}
      </div>

      {day.blackout ? (
        <span className="mt-1 hidden text-[10px] font-bold uppercase tracking-wide text-ink-mute lg:block">Blackout</span>
      ) : null}

      {/* Desktop: full pills */}
      <div className="mt-1 hidden flex-col gap-1 lg:flex">
        {shown.map((e, i) => (
          <EventPill key={i} event={e} />
        ))}
        {more > 0 ? <span className="px-1 text-[11px] font-bold text-coral-deep">+{more} more</span> : null}
      </div>

      {/* Mobile: colored dots */}
      {day.events.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1 lg:hidden">
          {day.events.slice(0, 4).map((e, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${CAT_BG[e.category]}`} />
          ))}
          {day.events.length > 4 ? <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function WeekColumn({
  day,
  selected,
  today,
  onSelect,
}: {
  day: CalDayData;
  selected: boolean;
  today: boolean;
  onSelect: () => void;
}) {
  const shell = selected
    ? "border-2 border-coral bg-coral-tint/40"
    : day.blackout
      ? "border border-sand bg-sand/50"
      : day.fullyBooked
        ? "border border-coral bg-coral-tint/30"
        : day.closed
          ? "border border-transparent bg-sand/25"
          : "border border-sand-line bg-white hover:border-sand";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex min-h-[220px] cursor-pointer flex-col gap-1 rounded-xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-ring lg:min-h-[440px] ${shell}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
            today ? "bg-brand text-white" : "text-ink"
          }`}
        >
          {day.dayNum}
        </span>
        {day.blackout ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            <Prohibit size={12} weight="bold" /> Blackout
          </span>
        ) : day.fullyBooked ? (
          <LockSimple size={12} weight="fill" className="text-coral-deep" />
        ) : day.closed ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">Closed</span>
        ) : null}
      </div>
      {day.events.length > 0 ? (
        day.events.map((e, i) => <EventPill key={i} event={e} />)
      ) : (
        <span className="px-1 text-[11px] font-medium text-ink-faint">—</span>
      )}
    </div>
  );
}

function DetailPanel({ detail, blackout, closed }: { detail: SelectedDayDetail | null; blackout?: boolean; closed?: boolean }) {
  if (!detail) {
    return <p className="text-sm font-medium text-ink-mute">Select a day to see its bookings.</p>;
  }
  const d = detail;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 lg:max-w-none">
      {blackout ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-sand px-3 py-1.5 text-[11px] font-extrabold tracking-wide text-ink-soft">
          <Prohibit size={12} weight="bold" /> BLACKOUT · NOT ACCEPTING BOOKINGS
        </span>
      ) : closed ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-sand px-3 py-1.5 text-[11px] font-extrabold tracking-wide text-ink-mute">
          <Prohibit size={12} weight="bold" /> CLOSED · NOT AN OPERATING DAY
        </span>
      ) : null}
      {d.fullyBooked ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-coral-tint px-3 py-1.5 text-[11px] font-extrabold tracking-wide text-coral-deep">
          <LockSimple size={12} weight="fill" /> FULLY BOOKED
        </span>
      ) : null}

      <div>
        <h2 className="font-display text-2xl font-bold text-ink">{d.dateLabel}</h2>
        <p className="mt-0.5 text-sm font-medium text-ink-mute">{d.summary}</p>
      </div>

      {d.bookings.length === 0 ? (
        <p className="border-t border-sand pt-4 text-sm font-medium text-ink-mute">
          Nothing scheduled this day.
        </p>
      ) : (
        d.bookings.map((b, i) => (
          <BookingCard key={b.id} booking={b} label={d.bookings.length > 1 ? `Booking ${i + 1} of ${d.bookings.length}` : "Booking"} />
        ))
      )}
    </div>
  );
}

function BookingCard({ booking, label }: { booking: SelectedBooking; label: string }) {
  const b = booking;
  return (
    <div className="border-t border-sand pt-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">{label}</div>
      <div className="mt-3 rounded-2xl bg-brand-tint/50 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white text-brand">
            <CastleTurret size={22} weight="fill" />
          </span>
          <div className="min-w-0">
            <div className="font-bold text-ink">{b.customer}</div>
            <div className="text-xs font-semibold text-ink-mute">{b.bookingNo}</div>
          </div>
        </div>

        {/* All line items on this booking. */}
        <ul className="mt-3 flex flex-col gap-2">
          {b.lineItems.map((li, i) => (
            <li key={i} className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${CAT_BG[li.category]}`} />
                <span className="text-[15px] font-bold text-ink">
                  {li.name}
                  {li.qty > 1 ? <span className="text-ink-mute"> ×{li.qty}</span> : null}
                </span>
              </span>
              <span className="flex-shrink-0 text-[13px] font-medium text-ink-mute">{li.price}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 text-[13px] font-medium text-ink-mute">{b.location}</div>

        <div className="mt-3 flex gap-2.5">
          <TimeBox label="Deliver" value={b.deliver} />
          <TimeBox label="Pick up" value={b.pickup} />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <StatusRow
          icon={<SealCheck size={22} weight="fill" className="text-teal" />}
          label={b.contract.label}
          detail={b.contract.detail}
          cls="border-teal-line bg-teal-tint"
        />
        <StatusRow
          icon={<ClockCountdown size={22} weight="fill" className="text-amber-deep" />}
          label={b.balance.label}
          detail={b.balance.detail}
          cls="border-amber-line bg-amber-tint"
        />
        <Link
          href={`/bookings/${b.id}`}
          className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
        >
          <ArrowSquareOut size={16} weight="bold" /> Open booking
        </Link>
      </div>
    </div>
  );
}

function TimeBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl bg-white p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">{label}</div>
      <div className="mt-0.5 font-display text-[15px] font-bold text-ink">{value}</div>
    </div>
  );
}

function StatusRow({
  icon,
  label,
  detail,
  cls,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  cls: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3.5 ${cls}`}>
      <span className="flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[14px] font-bold text-ink">{label}</div>
        <div className="text-[12.5px] font-medium text-ink-soft">{detail}</div>
      </div>
    </div>
  );
}
