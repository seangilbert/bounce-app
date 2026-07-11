import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDown,
  CloudRain,
  Sun,
  CheckCircle,
  Truck,
  Package,
  CurrencyDollar,
  Signature,
  ChatCircleDots,
  Wrench,
  TrendUp,
  Tag,
  ArrowsClockwise,
  ArrowRight,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { getSessionOperator } from "@/lib/operator/session";
import { timeGreeting, operatorToday } from "@/lib/operator/time";
import { getExpiringDocuments, docTypeLabel, type ExpiringDocument } from "@/lib/documents/repo";
import type { Operator } from "@/lib/inventory/types";
import {
  getDashboard,
  type DashboardData,
  type DashboardScope,
  type AttentionItem,
} from "@/lib/operator/data";
import { getWeatherAdvisory, type WeatherAdvisory } from "@/lib/operator/weather";
import { ConnectBanner } from "@/components/operator/ConnectBanner";
import { NewBookingButton } from "@/components/operator/bookings/NewBookingButton";
import { CustomerSearchBox } from "@/components/operator/customers/CustomerSearchBox";

export const dynamic = "force-dynamic";

const SCOPES: { key: DashboardScope; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

function parseScope(v?: string): DashboardScope {
  return v === "day" || v === "month" ? v : "week";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const op = await getSessionOperator();
  if (!op) return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  const scope = parseScope(searchParams.view);
  const data = await getDashboard(op.id, op.timezone, scope);
  const weather = await getWeatherAdvisory(op, data.todayStops);
  const expiringDocs = await getExpiringDocuments(op.id, operatorToday(op.timezone));
  return <DashboardBody data={data} operator={op} weather={weather} expiringDocs={expiringDocs} />;
}

function DashboardBody({
  data,
  operator,
  weather,
  expiringDocs,
}: {
  data: DashboardData;
  operator: Operator;
  weather: WeatherAdvisory | null;
  expiringDocs: ExpiringDocument[];
}) {
  const firstName = operator.ownerName?.split(/\s+/)[0] ?? operator.name;
  const greeting = timeGreeting(operator.timezone);
  const scopeWord = data.scope === "day" ? "today" : data.scope === "month" ? "this month" : "this week";
  return (
    <div className="flex w-full flex-col">
      {/* Top bar */}
      <div className="flex flex-col gap-4 border-b border-sand px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8 lg:py-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-[28px]">
            {greeting}, {firstName}
          </h1>
          <p className="mt-0.5 text-sm font-medium text-ink-mute">{data.dateLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <CustomerSearchBox />
          <NewBookingButton operatorId={operator.id} />
        </div>
      </div>

      {!operator.connectChargesEnabled ? (
        <div className="px-5 pt-5 lg:px-8 lg:pt-6">
          <ConnectBanner />
        </div>
      ) : null}

      {expiringDocs.length > 0 ? (
        <div className="px-5 pt-5 lg:px-8 lg:pt-6">
          <DocExpiryBanner docs={expiringDocs} />
        </div>
      ) : null}

      <div className="flex flex-col gap-5 px-5 py-5 lg:px-8 lg:py-6">
        {/* Scope toggle + period */}
        <div className="flex items-center justify-between gap-3">
          <ScopeTabs scope={data.scope} />
          <span className="text-[13px] font-bold text-ink-mute">{data.periodLabel}</span>
        </div>

        {/* Funnel — the pipeline for the selected period */}
        <FunnelCard data={data} scopeWord={scopeWord} />

        {/* Scope-specific content */}
        {data.scope === "month" ? (
          <MonthInsightsCard data={data} />
        ) : (
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
            <AttentionCard items={data.attention} scope={data.scope} />
            <div className="flex flex-col gap-5">
              <ComingUp items={data.comingUp} scope={data.scope} />
              <WeatherCard weather={weather} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DocExpiryBanner({ docs }: { docs: ExpiringDocument[] }) {
  const expired = docs.filter((d) => d.daysLeft < 0);
  const soonest = docs[0];
  const name = soonest.label?.trim() || docTypeLabel(soonest.type);
  const lead =
    expired.length > 0
      ? `${expired.length} document${expired.length === 1 ? " has" : "s have"} expired`
      : soonest.daysLeft === 0
        ? `${name} expires today`
        : `${name} expires in ${soonest.daysLeft} day${soonest.daysLeft === 1 ? "" : "s"}`;
  const extra = docs.length > 1 ? ` · ${docs.length} need attention` : "";
  return (
    <Link
      href="/documents"
      className="flex items-center gap-3 rounded-2xl border border-amber-line bg-amber-tint px-4 py-3 transition-colors hover:bg-amber-tint/70"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber/20 text-amber-deep">
        <Warning size={18} weight="fill" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-amber-deep">
          {lead}
          {extra}
        </span>
        <span className="block text-[12.5px] font-medium text-ink-mute">
          Keep your insurance, licenses, and permits current — review in Documents.
        </span>
      </span>
      <ArrowRight size={16} weight="bold" className="flex-shrink-0 text-amber-deep" />
    </Link>
  );
}

function ScopeTabs({ scope }: { scope: DashboardScope }) {
  return (
    <div className="flex gap-1 rounded-xl bg-sand/50 p-1">
      {SCOPES.map((s) => (
        <Link
          key={s.key}
          href={`/dashboard?view=${s.key}`}
          className={`rounded-lg px-4 py-1.5 text-[13px] font-bold transition-colors ${
            scope === s.key ? "bg-white text-ink shadow-sm" : "text-ink-mute hover:text-ink"
          }`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

// ---- Funnel ---------------------------------------------------------------

function FunnelCard({ data, scopeWord }: { data: DashboardData; scopeWord: string }) {
  const { quotes, paid, signed, conversionPct } = data.funnel;
  const stages = [
    { label: "Quotes", sub: "created", value: quotes, tone: "bg-brand" },
    { label: "Deposit paid", sub: "payment in", value: paid, tone: "bg-teal" },
    { label: "Full bookings", sub: "signed + paid", value: signed, tone: "bg-brand-deep" },
  ];
  const max = Math.max(quotes, 1);
  return (
    <section className="rounded-[24px] border border-sand-line bg-white p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink lg:text-xl">Booking funnel</h2>
          <p className="text-[13px] font-medium text-ink-mute">Quotes created {scopeWord} and how far they got.</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-brand-tint px-3.5 py-1.5 text-[13px] font-extrabold text-brand-deep">
          <TrendUp size={15} weight="bold" /> {conversionPct}% converted
        </div>
      </div>
      {quotes === 0 ? (
        <p className="mt-5 text-sm font-medium text-ink-mute">No quotes created {scopeWord} yet.</p>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {stages.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-24 flex-shrink-0 text-right lg:w-28">
                <div className="text-[13px] font-bold text-ink">{s.label}</div>
                <div className="text-[11px] font-medium text-ink-faint">{s.sub}</div>
              </div>
              <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-sand/40">
                <div
                  className={`flex h-full items-center rounded-lg ${s.tone} px-3 text-[13px] font-extrabold text-white`}
                  style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 12 : 0)}%` }}
                >
                  {s.value > 0 ? s.value : null}
                </div>
                {s.value === 0 ? (
                  <span className="absolute inset-y-0 left-0 flex items-center px-3 text-[13px] font-bold text-ink-faint">0</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---- Needs action (Day / Week) --------------------------------------------

const ATTENTION_META: Record<
  AttentionItem["kind"],
  { icon: React.ReactNode; tint: string; ink: string }
> = {
  deliver: { icon: <Truck size={16} weight="fill" />, tint: "bg-brand-tint", ink: "text-brand-deep" },
  pickup: { icon: <Package size={16} weight="fill" />, tint: "bg-teal-tint", ink: "text-teal-deep" },
  balance: { icon: <CurrencyDollar size={16} weight="fill" />, tint: "bg-amber-tint", ink: "text-amber-deep" },
  signature: { icon: <Signature size={16} weight="fill" />, tint: "bg-sand", ink: "text-ink-soft" },
  followup: { icon: <ChatCircleDots size={16} weight="fill" />, tint: "bg-coral-tint", ink: "text-coral-deep" },
  cleaning: { icon: <Wrench size={16} weight="fill" />, tint: "bg-amber-tint", ink: "text-amber-deep" },
};

function AttentionCard({ items, scope }: { items: AttentionItem[]; scope: DashboardScope }) {
  // Day shows everything (incl. today's deliveries/pickups); Week focuses on the
  // open pipeline gaps (balances, signatures, follow-ups).
  const all = scope === "day" ? items : items.filter((i) => i.kind !== "deliver" && i.kind !== "pickup");
  const CAP = 8;
  const shown = all.slice(0, CAP);
  const overflow = all.length - shown.length;
  return (
    <section className="rounded-[24px] border border-sand-line bg-white p-5 lg:p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink lg:text-xl">Needs attention</h2>
        {all.length > 0 ? (
          <span className="rounded-full bg-coral-tint px-2.5 py-1 text-[11px] font-extrabold text-coral-deep">{all.length}</span>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-ink-mute">
          <CheckCircle size={18} weight="fill" className="text-teal" /> All clear — nothing needs you right now.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-sand-line">
          {shown.map((it, i) => {
            const m = ATTENTION_META[it.kind];
            return (
              <li key={i}>
                <Link href={it.href} className="flex items-center gap-3 py-3 transition-opacity hover:opacity-80">
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${m.tint} ${m.ink}`}>
                    {m.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink">{it.title}</div>
                    <div className="truncate text-[12.5px] font-medium text-ink-mute">{it.subtitle}</div>
                  </div>
                  {it.amount ? <span className="flex-shrink-0 font-display text-sm font-bold text-ink tabular-nums">{it.amount}</span> : null}
                  <ArrowRight size={15} weight="bold" className="flex-shrink-0 text-ink-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {overflow > 0 ? (
        <Link href="/calendar" className="mt-3 flex items-center gap-1 text-[13px] font-bold text-brand transition-colors hover:text-brand-deep">
          +{overflow} more on the calendar <ArrowRight size={13} weight="bold" />
        </Link>
      ) : null}
    </section>
  );
}

// ---- Month insights -------------------------------------------------------

function MonthInsightsCard({ data }: { data: DashboardData }) {
  const m = data.month;
  const tiles = [
    { label: "Quotes → bookings", value: `${m.conversionPct}%`, sub: `${m.fullBookings} of ${m.quotes} quotes`, icon: <TrendUp size={18} weight="bold" />, tint: "text-brand" },
    { label: "Revenue booked", value: m.revenueBooked, sub: "paid bookings this month", icon: <CurrencyDollar size={18} weight="fill" />, tint: "text-teal" },
    { label: "Lost quotes", value: String(m.lostQuotes), sub: "expired or past-event", icon: <ArrowDown size={18} weight="bold" />, tint: "text-coral-deep" },
    { label: "Repeat customers", value: String(m.repeatCustomers), sub: "2+ bookings", icon: <ArrowsClockwise size={18} weight="bold" />, tint: "text-amber-deep" },
    { label: "Discounts given", value: m.discountsGiven, sub: "promo codes redeemed", icon: <Tag size={18} weight="fill" />, tint: "text-brand-deep" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[20px] border border-sand-line bg-white p-4 lg:p-5">
            <div className={`flex items-center gap-1.5 ${t.tint}`}>{t.icon}</div>
            <div className="mt-2 font-display text-[26px] font-bold text-ink lg:text-[30px]">{t.value}</div>
            <div className="mt-0.5 text-[13px] font-bold text-ink-soft">{t.label}</div>
            <div className="text-[12px] font-medium text-ink-mute">{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Coming up (event date) ----------------------------------------------

function ComingUp({ items, scope }: { items: DashboardData["comingUp"]; scope: DashboardScope }) {
  const title = scope === "day" ? "Today's route" : "Coming up";
  return (
    <div className="rounded-[20px] border border-sand-line bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        <Link href="/calendar" className="flex items-center gap-1 text-[13px] font-bold text-brand transition-colors hover:text-brand-deep">
          Calendar <ArrowUpRight size={14} weight="bold" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm font-medium text-ink-mute">Nothing scheduled {scope === "day" ? "today" : "in range"}.</p>
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
                <div className="truncate text-sm font-bold text-ink">{c.title}</div>
                <div className="truncate text-[12.5px] font-medium text-ink-mute">{c.subtitle}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
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
