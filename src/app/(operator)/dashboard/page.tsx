import Link from "next/link";
import {
  Sparkle,
  ArrowRight,
  ArrowUpRight,
  MagnifyingGlass,
  Plus,
  CloudRain,
  Sun,
  ArrowUp,
  ArrowDown,
  TrendUp,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { getSessionOperator } from "@/lib/operator/session";
import type { Operator } from "@/lib/inventory/types";
import { getDashboard, type DashboardData } from "@/lib/operator/data";
import { getWeatherAdvisory, type WeatherAdvisory } from "@/lib/operator/weather";
import { ConnectBanner } from "@/components/operator/ConnectBanner";
// Reply-time + weekly deltas remain lightweight config (no historical series yet).
import { aiSummary, weekStats } from "@/lib/operator/mock";
import type { Stop } from "@/lib/operator/mock";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const op = await getSessionOperator();
  if (!op) return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  const data = await getDashboard(op.id, op.timezone);
  const weather = await getWeatherAdvisory(op, data.todayStops);
  return <DashboardBody data={data} operator={op} weather={weather} />;
}

function DashboardBody({
  data,
  operator,
  weather,
}: {
  data: DashboardData;
  operator: Operator;
  weather: WeatherAdvisory | null;
}) {
  const firstName = operator.ownerName?.split(/\s+/)[0] ?? operator.name;
  return (
    <div className="flex w-full flex-col">
      {/* Top bar */}
      <div className="flex flex-col gap-4 border-b border-sand px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8 lg:py-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-[28px]">
            Good morning, {firstName}
          </h1>
          <p className="mt-0.5 text-sm font-medium text-ink-mute">
            {data.dateLabel} · {data.routeSummary}
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
          <button
            type="button"
            disabled
            title="Operator-created bookings — coming soon"
            className="flex flex-shrink-0 cursor-not-allowed items-center gap-2 rounded-full bg-brand/50 px-5 py-3 text-sm font-bold text-white shadow-sm"
          >
            <Plus size={16} weight="bold" />
            <span className="hidden sm:inline">New booking</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {!operator.connectChargesEnabled ? (
        <div className="px-5 pt-5 lg:px-8 lg:pt-6">
          <ConnectBanner />
        </div>
      ) : null}

      <div className="flex flex-col gap-5 px-5 py-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6 lg:px-8 lg:py-6">
        <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
          <AiHero data={data} />
          <TodaysRoute stops={data.todayStops} />
        </div>
        <div className="flex flex-col gap-4 lg:gap-5">
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <StatTile label="This week" value={data.revenue}>
              <span className="flex items-center gap-1 font-bold text-teal">
                <TrendUp size={14} weight="bold" />
                {weekStats.change}
              </span>
            </StatTile>
            <StatTile label="Bookings" value={String(data.bookings)}>
              <span className="font-semibold text-ink-mute">{weekStats.repliedPct}% replied</span>
            </StatTile>
          </div>
          <WeatherCard weather={weather} />
          <ComingUp items={data.comingUp} />
        </div>
      </div>
    </div>
  );
}

function AiHero({ data }: { data: DashboardData }) {
  return (
    <section className="rounded-[24px] bg-brand p-5 text-white shadow-[0_24px_50px_-26px_var(--brand-glow,rgba(59,125,240,0.65))] lg:rounded-[28px] lg:p-7">
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
            {data.quotesSent}
          </span>
          <span className="mt-0.5 max-w-[12ch] font-display text-lg font-bold leading-tight lg:mt-1 lg:text-[22px]">
            quotes sent while you were out
          </span>
        </div>
        <div className="flex flex-shrink-0 gap-5 lg:gap-8">
          <HeroStat label="Avg reply" value={`${aiSummary.avgReplyMin} min`} />
          <HeroStat label="Booked" value={`${data.booked} of ${data.quotesSent}`} />
        </div>
      </div>

      {data.needsYou > 0 && data.flaggedSummary ? (
        <div className="mt-5 rounded-[16px] bg-white p-4 lg:mt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex items-start gap-3 lg:flex-1">
              <span className="flex-shrink-0 rounded-full bg-brand-tint px-3 py-1.5 text-[11px] font-extrabold text-brand-deep">
                {data.needsYou} NEEDS YOU
              </span>
              <p className="text-sm font-medium leading-snug text-ink">{data.flaggedSummary}</p>
            </div>
            <Link
              href="/inquiries"
              className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep lg:flex-shrink-0"
            >
              Review &amp; reply <ArrowRight size={15} weight="bold" />
            </Link>
          </div>
        </div>
      ) : null}
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
        <Link
          href="/deliveries"
          className="flex items-center gap-1.5 text-sm font-bold text-brand transition-colors hover:text-brand-deep"
        >
          <span className="hidden sm:inline">Open route</span>
          <span className="sm:hidden">Route</span>
          <ArrowUpRight size={15} weight="bold" />
        </Link>
      </div>
      {stops.length === 0 ? (
        <p className="py-6 text-sm font-medium text-ink-mute">No deliveries scheduled today.</p>
      ) : (
        <ol className="mt-2 divide-y divide-sand-line">
          {stops.map((stop, i) => (
            <RouteRow key={i} stop={stop} />
          ))}
        </ol>
      )}
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

function WeatherCard({ weather }: { weather: WeatherAdvisory | null }) {
  if (!weather) {
    return (
      <div className="rounded-[20px] border border-sand-line bg-white p-5">
        <div className="flex items-center gap-2.5">
          <Sun size={20} weight="fill" className="text-amber" />
          <span className="text-base font-extrabold text-ink">Clear skies today</span>
        </div>
        <p className="mt-2 text-[13.5px] font-medium leading-snug text-ink-mute">
          No rain in the forecast for your route — a good day for setups.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-[20px] border border-amber-line bg-amber-tint p-5">
      <div className="flex items-center gap-2.5">
        <CloudRain size={20} weight="fill" className="text-amber-deep" />
        <span className="text-base font-extrabold text-[#5C4B22]">{weather.headline}</span>
      </div>
      <p className="mt-2 text-[13.5px] font-medium leading-snug text-[#8A7A55]">{weather.detail}</p>
    </div>
  );
}

function ComingUp({ items }: { items: DashboardData["comingUp"] }) {
  return (
    <div className="rounded-[20px] border border-sand-line bg-white p-5">
      <h3 className="font-display text-lg font-bold text-ink">Coming up</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm font-medium text-ink-mute">Nothing upcoming.</p>
      ) : (
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
      )}
    </div>
  );
}
