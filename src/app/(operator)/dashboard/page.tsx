import Link from "next/link";
import {
  Sparkle,
  ArrowRight,
  CloudRain,
  CaretRight,
  ArrowUp,
  ArrowDown,
  MapPin,
  CastleTurret,
  TrendUp,
} from "@phosphor-icons/react/dist/ssr";
import {
  operator,
  today,
  weekStats,
  aiSummary,
  flaggedInquiry,
  weatherAdvisory,
  todayStops,
  type Stop,
} from "@/lib/operator/mock";

export default function DashboardPage() {
  return (
    <div className="flex w-full flex-col">
      {/* ── Bold coral header ───────────────────────────── */}
      <header className="rounded-b-[28px] bg-gradient-to-br from-coral to-coral-deep px-5 pb-8 pt-9 text-white lg:px-8 lg:pt-10">
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

      <div className="-mt-3 flex flex-col gap-4 px-4 pt-1 lg:mt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:px-8">
        <AiAssistantCard />
        <TodaySchedule stops={todayStops} />
      </div>
    </div>
  );
}

function AiAssistantCard() {
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

      {/* Nested "needs you" flagged inquiry */}
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

function TodaySchedule({ stops }: { stops: Stop[] }) {
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

      {/* Weather advisory, inline (1b) */}
      <button className="mt-3 flex w-full items-center gap-2.5 rounded-2xl border border-amber-line bg-amber-tint px-3.5 py-3 text-left">
        <CloudRain size={18} weight="fill" className="flex-shrink-0 text-amber-deep" />
        <span className="flex-1 text-[12.5px] font-semibold leading-snug text-[#5C4B22]">
          {weatherAdvisory.short}
        </span>
        <ArrowRight size={13} weight="bold" className="flex-shrink-0 text-brand-deep" />
      </button>

      <ol className="mt-3 flex flex-col gap-2.5">
        {stops.map((stop, i) => (
          <StopCard key={i} stop={stop} />
        ))}
      </ol>
    </section>
  );
}

function StopCard({ stop }: { stop: Stop }) {
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
