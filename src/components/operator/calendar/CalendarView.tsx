import {
  CaretLeft,
  CaretRight,
  Plus,
  LockSimple,
  CastleTurret,
  SealCheck,
  ClockCountdown,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import {
  weekdays,
  type CalDay,
  type CalEvent,
  type CalendarMonth,
  type ItemCategory,
  type SelectedDayDetail,
} from "@/lib/operator/calendar";

const CAT_BG: Record<ItemCategory, string> = {
  bounce: "bg-brand",
  tent: "bg-teal",
  tables: "bg-amber",
};

export function CalendarView({ monthLabel, monthDays, selected }: CalendarMonth) {
  return (
    <div className="lg:flex lg:h-dvh lg:overflow-hidden">
      {/* Calendar */}
      <div className="flex min-w-0 flex-1 flex-col lg:h-dvh">
        {/* Top bar */}
        <div className="flex flex-col gap-3 border-b border-sand px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-8 lg:py-5">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-ink lg:text-[28px]">{monthLabel}</h1>
            <div className="flex gap-1.5">
              <NavBtn>
                <CaretLeft size={16} weight="bold" />
              </NavBtn>
              <NavBtn>
                <CaretRight size={16} weight="bold" />
              </NavBtn>
            </div>
            <button className="text-sm font-bold text-brand">Today</button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-full bg-sand/70 p-1">
              <span className="rounded-full px-4 py-1.5 text-sm font-bold text-ink-soft">Week</span>
              <span className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-ink shadow-sm">
                Month
              </span>
            </div>
            <button className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-deep">
              <Plus size={16} weight="bold" />
              <span className="hidden sm:inline">New booking</span>
              <span className="sm:hidden">New</span>
            </button>
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
          <div className="grid grid-cols-7 gap-1.5 lg:gap-2">
            {monthDays.map((day, i) => (
              <DayCell key={i} day={day} selected={selected != null && day.date === selected.date} />
            ))}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <aside className="border-t border-sand p-5 lg:h-dvh lg:w-[360px] lg:flex-shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
        <DetailPanel detail={selected} />
      </aside>
    </div>
  );
}

function NavBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand bg-white text-ink-soft">
      {children}
    </button>
  );
}

function EventPill({ event }: { event: CalEvent }) {
  return (
    <span
      className={`block truncate rounded-md px-2 py-1 text-[11px] font-bold text-white ${CAT_BG[event.category]}`}
    >
      {event.label}
    </span>
  );
}

function DayCell({ day, selected }: { day: CalDay; selected: boolean }) {
  if (day.date === null) {
    return <div className="min-h-[64px] rounded-xl bg-sand/20 lg:min-h-[140px]" />;
  }
  const fb = day.fullyBooked;
  const shell = selected
    ? "border-2 border-coral bg-coral-tint/50"
    : fb
      ? "border border-coral bg-coral-tint/40"
      : "border border-sand-line bg-white";
  return (
    <button className={`flex min-h-[64px] flex-col rounded-xl p-1.5 text-left lg:min-h-[140px] lg:p-2 ${shell}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[13px] font-bold ${fb ? "text-coral-deep" : "text-ink"}`}>
          {day.date}
        </span>
        {fb ? <LockSimple size={12} weight="fill" className="text-coral-deep" /> : null}
      </div>

      {/* Desktop: full pills */}
      <div className="mt-1 hidden flex-col gap-1 lg:flex">
        {day.events.map((e, i) => (
          <EventPill key={i} event={e} />
        ))}
        {day.moreCount > 0 ? (
          <span className="px-1 text-[11px] font-bold text-coral-deep">+{day.moreCount} more</span>
        ) : null}
      </div>

      {/* Mobile: colored dots */}
      {day.events.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1 lg:hidden">
          {day.events.map((e, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${CAT_BG[e.category]}`} />
          ))}
          {day.moreCount > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" /> : null}
        </div>
      ) : null}
    </button>
  );
}

function DetailPanel({ detail }: { detail: SelectedDayDetail | null }) {
  if (!detail) {
    return <p className="text-sm font-medium text-ink-mute">Select a day to see its bookings.</p>;
  }
  const d = detail;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 lg:max-w-none">
      {d.fullyBooked ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-coral-tint px-3 py-1.5 text-[11px] font-extrabold tracking-wide text-coral-deep">
          <LockSimple size={12} weight="fill" /> FULLY BOOKED
        </span>
      ) : null}

      <div>
        <h2 className="font-display text-2xl font-bold text-ink">{d.dateLabel}</h2>
        <p className="mt-0.5 text-sm font-medium text-ink-mute">{d.summary}</p>
      </div>

      {d.booking ? (
      <div className="border-t border-sand pt-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
          Selected booking
        </div>
        <div className="mt-3 rounded-2xl bg-brand-tint/50 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white text-brand">
              <CastleTurret size={22} weight="fill" />
            </span>
            <div className="min-w-0">
              <div className="font-bold text-ink">{d.booking.customer}</div>
              <div className="text-xs font-semibold text-ink-mute">{d.booking.bookingNo}</div>
            </div>
          </div>
          <div className="mt-3 text-[15px] font-bold text-ink">{d.booking.item}</div>
          <div className="text-[13px] font-medium text-ink-mute">
            {d.booking.price} · {d.booking.location}
          </div>
          <div className="mt-3 flex gap-2.5">
            <TimeBox label="Deliver" value={d.booking.deliver} />
            <TimeBox label="Pick up" value={d.booking.pickup} />
          </div>
        </div>
      </div>
      ) : null}

      {d.contract ? (
        <StatusRow
          icon={<SealCheck size={22} weight="fill" className="text-teal" />}
          label={d.contract.label}
          detail={d.contract.detail}
          cls="border-teal-line bg-teal-tint"
        />
      ) : null}
      {d.balance ? (
        <StatusRow
          icon={<ClockCountdown size={22} weight="fill" className="text-amber-deep" />}
          label={d.balance.label}
          detail={d.balance.detail}
          cls="border-amber-line bg-amber-tint"
        />
      ) : null}

      <button className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep">
        <ArrowSquareOut size={16} weight="bold" /> Open booking
      </button>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
          Also out this day
        </div>
        <ul className="mt-3 flex flex-col gap-3">
          {d.alsoOut.map((a, i) => (
            <li key={i} className="flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-brand" />
                <span className="text-sm font-bold text-ink">{a.item}</span>
              </span>
              <span className="text-sm font-medium text-ink-mute">{a.time}</span>
            </li>
          ))}
        </ul>
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
