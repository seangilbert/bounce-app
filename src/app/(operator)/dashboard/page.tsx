import Link from "next/link";
import {
  Sparkle,
  ArrowRight,
  ArrowUpRight,
  MagnifyingGlass,
  Plus,
  CloudRain,
  CaretRight,
  ArrowUp,
  ArrowDown,
  MapPin,
  CastleTurret,
  TrendUp,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import {
  operator,
  today,
  weekStats,
  aiSummary,
  flaggedInquiry,
  weatherAdvisory,
  todayStops,
  comingUp,
  type Stop,
  type ComingUpItem,
} from "@/lib/operator/mock";

export default function DashboardPage() {
  return (
    <>
      <MobileDashboard />
      <DesktopDashboard />
    </>
  );
}

/* ══════════════════════════ DESKTOP ══════════════════════════ */

function DesktopDashboard() {
  return (
    <div className="hidden lg:block">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-sand px-8 py-6">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">
            Good morning, {operator.firstName}
          </h1>
          <p className="mt-0.5 text-sm font-medium text-ink-mute">
            {today.dateLabel} · {today.routeSummary}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex w-[320px] items-center gap-2.5 rounded-full border border-sand bg-white px-4 py-2.5">
            <MagnifyingGlass size={18} className="flex-shrink-0 text-ink-faint" />
            <input
              placeholder="Search bookings, customers…"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          <button className="flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-deep">
            <Plus size={16} weight="bold" /> New booking
          </button>
        </div>
      </div>

      {/* Content: main + right rail */}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 px-8 py-6">
        <div className="flex flex-col gap-6">
          <AiHero />
          <TodaysRoute stops={todayStops} />
        </div>
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <StatTile label="This week" value={weekStats.revenue}>
              <span className="flex items-center gap-1 font-bold text-teal">
                <TrendUp size={14} weight="bold" />
                {weekStats.change}
              </span>
            </StatTile>
            <StatTile label="Bookings" value={String(weekStats.bookings)}>
              <span className="font-semibold text-ink-mute">{weekStats.repliedPct}% replied</span>
            </StatTile>
          </div>
          <WeatherCard />
          <ComingUp items={comingUp} />
        </div>
      </div>
    </div>
  );
}

function AiHero() {
  return (
    <section className="rounded-[28px] bg-brand p-7 text-white shadow-[0_24px_50px_-26px_rgba(59,125,240,0.65)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkle size={18} weight="fill" />
          <span className="text-[15px] font-extrabold">AI Quote Assistant</span>
        </div>
        <span className="rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-bold">
          Active since {aiSummary.since}
        </span>
      </div>

      <div className="mt-5 flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <span className="font-display text-[64px] font-bold leading-[0.9]">
            {aiSummary.quotesSent}
          </span>
          <span className="mt-1 max-w-[13ch] font-display text-[22px] font-bold leading-tight">
            quotes sent while you were out
          </span>
        </div>
        <div className="flex flex-shrink-0 gap-8 pt-1">
          <HeroStat label="Avg reply" value={`${aiSummary.avgReplyMin} min`} />
          <HeroStat label="Booked" value={`${aiSummary.booked} of ${aiSummary.total}`} />
        </div>
      </div>

      {/* Nested "needs you" */}
      <div className="mt-6 flex items-center gap-4 rounded-[18px] bg-white p-4">
        <span className="flex-shrink-0 rounded-full bg-brand-tint px-3 py-1.5 text-[11px] font-extrabold text-brand-deep">
          {aiSummary.needsYou} NEEDS YOU
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-ink">
          {flaggedInquiry.summary}
        </p>
        <Link
          href="/inquiries"
          className="flex flex-shrink-0 items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
        >
          Review &amp; reply <ArrowRight size={15} weight="bold" />
        </Link>
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-white/70">{label}</div>
      <div className="font-display text-[22px] font-bold">{value}</div>
    </div>
  );
}

function TodaysRoute({ stops }: { stops: Stop[] }) {
  return (
    <section className="rounded-[28px] border border-sand-line bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-ink">Today&apos;s route</h2>
        <button className="flex items-center gap-1.5 text-sm font-bold text-brand">
          Open route map <ArrowUpRight size={15} weight="bold" />
        </button>
      </div>
      <ol className="mt-2 divide-y divide-sand-line">
        {stops.map((stop, i) => (
          <RouteRow key={i} stop={stop} />
        ))}
      </ol>
    </section>
  );
}

function RouteRow({ stop }: { stop: Stop }) {
  const deliver = stop.type === "DELIVER";
  return (
    <li className="flex items-center gap-4 py-4">
      <div className="w-14 flex-shrink-0">
        <div className="font-display text-base font-bold text-ink">{stop.time}</div>
        <div className="text-[11px] font-bold text-ink-faint">{stop.meridiem}</div>
      </div>
      <span
        className={`flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${
          deliver ? "bg-brand-tint text-brand-deep" : "bg-teal-tint text-teal-deep"
        }`}
      >
        {deliver ? <ArrowUp size={9} weight="fill" /> : <ArrowDown size={9} weight="fill" />}
        {stop.type}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-ink">{stop.item}</div>
        <div className="truncate text-[13px] font-medium text-ink-mute">
          {stop.customer} · {stop.address}
        </div>
      </div>
      <RouteStatus status={stop.status} />
    </li>
  );
}

function RouteStatus({ status }: { status: Stop["status"] }) {
  if (status.tone === "ok") {
    return (
      <span className="flex flex-shrink-0 items-center gap-1.5 text-[13px] font-bold text-teal">
        <CheckCircle size={17} weight="fill" />
        {status.label}
      </span>
    );
  }
  if (status.tone === "warn") {
    return (
      <span className="flex flex-shrink-0 items-center gap-1.5 text-[13px] font-bold text-amber-deep">
        <CloudRain size={16} weight="fill" />
        {status.label}
      </span>
    );
  }
  return <span className="flex-shrink-0 text-[13px] font-semibold text-ink-mute">{status.label}</span>;
}

function StatTile({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-sand-line bg-white p-5">
      <div className="text-[13px] font-semibold text-ink-mute">{label}</div>
      <div className="mt-1 font-display text-[28px] font-bold text-ink">{value}</div>
      <div className="mt-1 text-[13px]">{children}</div>
    </div>
  );
}

function WeatherCard() {
  return (
    <div className="rounded-[20px] border border-amber-line bg-amber-tint p-5">
      <div className="flex items-center gap-2.5">
        <CloudRain size={20} weight="fill" className="text-amber-deep" />
        <span className="text-base font-extrabold text-[#5C4B22]">{weatherAdvisory.headline}</span>
      </div>
      <p className="mt-2 text-[13.5px] font-medium leading-snug text-[#8A7A55]">
        Could affect the <b className="text-[#5C4B22]">Miller</b> 10 AM setup in Plymouth. A
        heads-up message is drafted and ready to send.
      </p>
      <div className="mt-4 flex gap-2.5">
        <button className="flex-1 rounded-xl bg-amber px-4 py-3 text-sm font-extrabold text-white transition-colors hover:bg-amber-deep">
          Review message
        </button>
        <button className="rounded-xl border border-amber-line bg-white px-4 py-3 text-sm font-bold text-ink-soft">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ComingUp({ items }: { items: ComingUpItem[] }) {
  return (
    <div className="rounded-[20px] border border-sand-line bg-white p-5">
      <h3 className="font-display text-lg font-bold text-ink">Coming up</h3>
      <ul className="mt-3 flex flex-col gap-3.5">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl leading-none ${
                c.tone === "coral" ? "bg-coral-tint text-coral-deep" : "bg-sand text-ink-soft"
              }`}
            >
              <span className="text-[9px] font-extrabold">{c.month}</span>
              <span className="font-display text-[15px] font-bold">{c.day}</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink">{c.title}</div>
              <div className="truncate text-[12.5px] font-medium text-ink-mute">{c.subtitle}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ══════════════════════════ MOBILE (1b) ══════════════════════════ */

function MobileDashboard() {
  return (
    <div className="flex w-full flex-col lg:hidden">
      <header className="rounded-b-[28px] bg-gradient-to-br from-coral to-coral-deep px-5 pb-8 pt-9 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">
              {today.dateLabel}
            </div>
            <h1 className="mt-1.5 font-display text-[26px] font-bold leading-tight tracking-tight">
              Good morning, {operator.firstName}
            </h1>
          </div>
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[15px] bg-white/20 font-display text-[15px] font-extrabold">
            {operator.initials}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-semibold text-white/85">
          <TrendUp size={15} weight="bold" className="text-white" />
          <span className="font-display text-base font-extrabold text-white">
            {weekStats.revenue}
          </span>
          this week
          <span className="opacity-40">·</span>
          {weekStats.bookings} bookings
          <span className="opacity-40">·</span>
          {weekStats.repliedPct}% replied
        </div>
      </header>

      <div className="-mt-3 flex flex-col gap-4 px-4 pt-1">
        <MobileAiCard />
        <MobileSchedule stops={todayStops} />
      </div>
    </div>
  );
}

function MobileAiCard() {
  return (
    <section className="rounded-[24px] border border-sand-line bg-white p-4 shadow-[0_16px_34px_-22px_rgba(59,125,240,0.45)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-brand">
          <Sparkle size={17} weight="fill" />
          <span className="text-[13px] font-extrabold text-ink">AI Quote Assistant</span>
        </div>
        <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-bold text-brand-deep">
          since {aiSummary.since}
        </span>
      </div>
      <div className="mt-3 font-display text-[21px] font-bold leading-tight tracking-tight text-ink">
        {aiSummary.quotesSent} quotes sent while you were out
      </div>
      <div className="mt-1 text-[12.5px] font-semibold text-ink-mute">
        Avg reply {aiSummary.avgReplyMin} min · all before 9 AM ·{" "}
        <span className="font-extrabold text-teal">{aiSummary.booked} booked</span>
      </div>
      <Link
        href="/inquiries"
        className="mt-3.5 block rounded-[18px] border border-brand-ring bg-brand-tint p-3.5 transition-colors hover:bg-brand-ring"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-brand-deep">
            {aiSummary.needsYou} NEEDS YOU
          </span>
          <span className="text-[11.5px] font-semibold text-ink-mute">
            {flaggedInquiry.customer} · {flaggedInquiry.location}
          </span>
        </div>
        <p className="mt-2.5 text-[13.5px] font-medium leading-snug text-ink">
          “{flaggedInquiry.message}”
        </p>
        <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-white p-2.5">
          <Sparkle size={13} weight="fill" className="mt-0.5 flex-shrink-0 text-brand" />
          <p className="text-[12px] font-semibold leading-snug text-ink-soft">
            {flaggedInquiry.aiNote}
          </p>
        </div>
        <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[12.5px] font-extrabold text-brand-deep">
          Review &amp; reply <ArrowRight size={12} weight="bold" />
        </div>
      </Link>
    </section>
  );
}

function MobileSchedule({ stops }: { stops: Stop[] }) {
  return (
    <section className="pb-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold text-ink">
          Today <span className="text-sm font-semibold text-ink-faint">· {stops.length} stops</span>
        </h2>
        <button className="inline-flex items-center gap-1 text-[12.5px] font-extrabold text-brand">
          Route <CaretRight size={11} weight="bold" />
        </button>
      </div>
      <button className="mt-3 flex w-full items-center gap-2.5 rounded-2xl border border-amber-line bg-amber-tint px-3.5 py-3 text-left">
        <CloudRain size={18} weight="fill" className="flex-shrink-0 text-amber-deep" />
        <span className="flex-1 text-[12.5px] font-semibold leading-snug text-[#5C4B22]">
          {weatherAdvisory.short}
        </span>
        <ArrowRight size={13} weight="bold" className="flex-shrink-0 text-brand-deep" />
      </button>
      <ol className="mt-3 flex flex-col gap-2.5">
        {stops.map((stop, i) => (
          <MobileStop key={i} stop={stop} />
        ))}
      </ol>
    </section>
  );
}

function MobileStop({ stop }: { stop: Stop }) {
  const deliver = stop.type === "DELIVER";
  return (
    <li className="flex items-center gap-3 rounded-[20px] border border-sand-line bg-white p-3.5">
      <div className="w-10 flex-shrink-0 text-center">
        <div className="font-display text-[15px] font-bold text-ink">{stop.time}</div>
        <div className="text-[10px] font-bold text-[#9A8D83]">{stop.meridiem}</div>
      </div>
      <div className="self-stretch border-l border-sand-line" />
      <div className="min-w-0 flex-1">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide ${
            deliver ? "bg-brand-tint text-brand-deep" : "bg-teal-tint text-teal-deep"
          }`}
        >
          {deliver ? <ArrowUp size={9} weight="fill" /> : <ArrowDown size={9} weight="fill" />}
          {stop.type}
        </span>
        <div className="mt-1.5 truncate text-sm font-bold text-ink">{stop.item}</div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] font-semibold text-ink-mute">
          <MapPin size={13} className="flex-shrink-0" />
          {stop.customer} · {stop.address}
        </div>
      </div>
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[13px] bg-hatch text-[#BCAD9E]">
        <CastleTurret size={20} />
      </div>
    </li>
  );
}
