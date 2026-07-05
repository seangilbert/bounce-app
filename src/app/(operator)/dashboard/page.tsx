import Link from "next/link";
import {
  Sparkle,
  ArrowRight,
  ArrowUpRight,
  MagnifyingGlass,
  Plus,
  CloudRain,
  ArrowUp,
  ArrowDown,
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

/**
 * Single responsive dashboard — the same components and colors at every width.
 * Mobile stacks the cards in one column; desktop (lg) splits into a main column
 * + right rail.
 */
export default function DashboardPage() {
  return (
    <div className="flex w-full flex-col">
      {/* Top bar */}
      <div className="flex flex-col gap-4 border-b border-sand px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8 lg:py-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-[28px]">
            Good morning, {operator.firstName}
          </h1>
          <p className="mt-0.5 text-sm font-medium text-ink-mute">
            {today.dateLabel} · {today.routeSummary}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2.5 rounded-full border border-sand bg-white px-4 py-2.5 sm:w-[280px] sm:flex-none lg:w-[320px]">
            <MagnifyingGlass size={18} className="flex-shrink-0 text-ink-faint" />
            <input
              placeholder="Search bookings, customers…"
              className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          <button className="flex flex-shrink-0 items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-deep">
            <Plus size={16} weight="bold" />
            <span className="hidden sm:inline">New booking</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* Content: stacked on mobile, main + rail on desktop */}
      <div className="flex flex-col gap-5 px-5 py-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6 lg:px-8 lg:py-6">
        <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
          <AiHero />
          <TodaysRoute stops={todayStops} />
        </div>
        <div className="flex flex-col gap-4 lg:gap-5">
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
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
    <section className="rounded-[24px] bg-brand p-5 text-white shadow-[0_24px_50px_-26px_rgba(59,125,240,0.65)] lg:rounded-[28px] lg:p-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkle size={18} weight="fill" />
          <span className="text-[15px] font-extrabold">AI Quote Assistant</span>
        </div>
        <span className="rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-bold">
          Active since {aiSummary.since}
        </span>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4 lg:mt-5 lg:gap-6">
        <div className="flex items-start gap-3 lg:gap-4">
          <span className="font-display text-[48px] font-bold leading-[0.9] lg:text-[64px]">
            {aiSummary.quotesSent}
          </span>
          <span className="mt-0.5 max-w-[12ch] font-display text-lg font-bold leading-tight lg:mt-1 lg:text-[22px]">
            quotes sent while you were out
          </span>
        </div>
        <div className="flex flex-shrink-0 gap-5 lg:gap-8">
          <HeroStat label="Avg reply" value={`${aiSummary.avgReplyMin} min`} />
          <HeroStat label="Booked" value={`${aiSummary.booked} of ${aiSummary.total}`} />
        </div>
      </div>

      <div className="mt-5 rounded-[16px] bg-white p-4 lg:mt-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="flex items-start gap-3 lg:flex-1">
            <span className="flex-shrink-0 rounded-full bg-brand-tint px-3 py-1.5 text-[11px] font-extrabold text-brand-deep">
              {aiSummary.needsYou} NEEDS YOU
            </span>
            <p className="text-sm font-medium leading-snug text-ink">{flaggedInquiry.summary}</p>
          </div>
          <Link
            href="/inquiries"
            className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep lg:flex-shrink-0"
          >
            Review &amp; reply <ArrowRight size={15} weight="bold" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-white/70">{label}</div>
      <div className="font-display text-lg font-bold lg:text-[22px]">{value}</div>
    </div>
  );
}

function TodaysRoute({ stops }: { stops: Stop[] }) {
  return (
    <section className="rounded-[24px] border border-sand-line bg-white p-5 lg:rounded-[28px] lg:p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink lg:text-xl">Today&apos;s route</h2>
        <button className="flex items-center gap-1.5 text-sm font-bold text-brand">
          <span className="hidden sm:inline">Open route map</span>
          <span className="sm:hidden">Map</span>
          <ArrowUpRight size={15} weight="bold" />
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
    <li className="flex items-center gap-3 py-4 lg:gap-4">
      <div className="w-12 flex-shrink-0 lg:w-14">
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
        <div className="truncate text-sm font-bold text-ink lg:text-[15px]">{stop.item}</div>
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
        <span className="hidden sm:inline">{status.label}</span>
      </span>
    );
  }
  if (status.tone === "warn") {
    return (
      <span className="flex flex-shrink-0 items-center gap-1.5 text-[13px] font-bold text-amber-deep">
        <CloudRain size={16} weight="fill" />
        <span className="hidden sm:inline">{status.label}</span>
      </span>
    );
  }
  return (
    <span className="hidden flex-shrink-0 text-[13px] font-semibold text-ink-mute sm:block">
      {status.label}
    </span>
  );
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
    <div className="rounded-[20px] border border-sand-line bg-white p-4 lg:p-5">
      <div className="text-[13px] font-semibold text-ink-mute">{label}</div>
      <div className="mt-1 font-display text-[26px] font-bold text-ink lg:text-[28px]">{value}</div>
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
