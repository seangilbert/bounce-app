"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Truck,
  Package,
  MapPin,
  Phone,
  ChatText,
  EnvelopeSimple,
  CheckCircle,
  CaretLeft,
  CaretRight,
  ArrowSquareOut,
  CircleNotch,
  Wrench,
} from "@phosphor-icons/react/dist/ssr";
import type { DeliveryRoute, RouteStop } from "@/lib/operator/deliveries";
import { markDeliveredAction, markCompletedAction } from "@/app/(operator)/bookings/actions";

function shiftIso(iso: string, delta: number): string {
  const d = new Date(new Date(`${iso}T00:00:00Z`).getTime() + delta * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function DeliveriesView({ route }: { route: DeliveryRoute }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function mark(stop: RouteStop) {
    setBusyKey(stop.key);
    const res =
      stop.kind === "DELIVER"
        ? await markDeliveredAction(stop.bookingId)
        : await markCompletedAction(stop.bookingId);
    if (res.ok) router.refresh();
    setBusyKey(null);
  }

  const href = (iso: string) => `/deliveries?d=${iso}`;
  const total = route.dropOffs.length + route.pickUps.length;
  const remaining =
    route.dropOffs.filter((s) => !s.done).length + route.pickUps.filter((s) => !s.done).length;

  return (
    <div className="flex w-full flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-sand px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-8 lg:py-5">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-ink lg:text-[28px]">Route</h1>
          <div className="flex gap-1.5">
            <NavBtn href={href(shiftIso(route.dateIso, -1))} label="Previous day">
              <CaretLeft size={16} weight="bold" />
            </NavBtn>
            <NavBtn href={href(shiftIso(route.dateIso, 1))} label="Next day">
              <CaretRight size={16} weight="bold" />
            </NavBtn>
          </div>
          <Link href={href(route.todayIso)} className="text-sm font-bold text-brand hover:text-brand-deep">
            Today
          </Link>
        </div>
        <div className="text-sm font-semibold text-ink-mute">
          <span className="font-bold text-ink">{route.dateLabel}</span>
          {total > 0 ? ` · ${total} stop${total === 1 ? "" : "s"}${remaining > 0 ? ` · ${remaining} left` : " · all done"}` : ""}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-5 py-5 lg:px-8 lg:py-6">
        {total === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sand text-ink-mute">
              <Truck size={26} />
            </div>
            <h2 className="font-display text-xl font-bold text-ink">No stops this day</h2>
            <p className="max-w-sm text-sm font-medium text-ink-mute">
              Nothing to drop off or pick up on {route.dateLabel}. Try another day.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            <Section title="Drop-offs" count={route.dropOffs.length} kind="DELIVER">
              {route.dropOffs.map((s) => (
                <StopCard key={s.key} stop={s} busy={busyKey === s.key} onMark={() => mark(s)} />
              ))}
            </Section>
            <Section title="Pick-ups" count={route.pickUps.length} kind="PICKUP">
              {route.pickUps.map((s) => (
                <StopCard key={s.key} stop={s} busy={busyKey === s.key} onMark={() => mark(s)} />
              ))}
            </Section>
          </div>
        )}
      </div>
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

function Section({
  title,
  count,
  kind,
  children,
}: {
  title: string;
  count: number;
  kind: "DELIVER" | "PICKUP";
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  const Icon = kind === "DELIVER" ? Truck : Package;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Icon size={18} weight="fill" className={kind === "DELIVER" ? "text-brand" : "text-teal"} />
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-ink-soft">
          {title} · {count}
        </h2>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function ActionBtn({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Phone;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="flex items-center gap-1.5 rounded-full border border-sand bg-white px-3.5 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:bg-sand/60"
    >
      <Icon size={15} weight="fill" /> {children}
    </a>
  );
}

function StopCard({ stop, busy, onMark }: { stop: RouteStop; busy: boolean; onMark: () => void }) {
  const isDeliver = stop.kind === "DELIVER";
  // Loadout checklist ticks — a local aid for this session (not yet persisted).
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const allLoaded = stop.equipment.length > 0 && stop.equipment.every((e) => loaded.has(e.label));
  const toggleLoaded = (label: string) =>
    setLoaded((s) => {
      const n = new Set(s);
      if (n.has(label)) n.delete(label);
      else n.add(label);
      return n;
    });
  const mapsUrl = stop.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.address}${stop.zip ? ` ${stop.zip}` : ""}`)}`
    : null;

  return (
    <div className={`rounded-2xl border bg-white p-4 ${stop.done ? "border-sand-line opacity-70" : "border-sand-line"}`}>
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${
            isDeliver ? "bg-brand-tint text-brand-deep" : "bg-teal-tint text-teal-deep"
          }`}
        >
          {isDeliver ? <Truck size={12} weight="fill" /> : <Package size={12} weight="fill" />}
          {isDeliver ? "DELIVER" : "PICK UP"}
        </span>
        <span className="text-sm font-bold text-ink">{stop.timeWindow}</span>
      </div>

      <div className="mt-2.5">
        <div className="font-display text-lg font-bold text-ink">{stop.customer}</div>
        {stop.items ? <div className="mt-0.5 text-sm font-medium text-ink-soft">{stop.items}</div> : null}
        {stop.address ? (
          <div className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-ink-mute">
            <MapPin size={15} weight="fill" className="mt-0.5 flex-shrink-0 text-ink-faint" />
            <span>
              {stop.address}
              {stop.zip ? ` · ${stop.zip}` : ""}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {mapsUrl ? (
          <ActionBtn href={mapsUrl} icon={MapPin}>
            Maps
          </ActionBtn>
        ) : null}
        {stop.phone ? (
          <>
            <ActionBtn href={`tel:${stop.phone}`} icon={Phone}>
              Call
            </ActionBtn>
            <ActionBtn href={`sms:${stop.phone}`} icon={ChatText}>
              Text
            </ActionBtn>
          </>
        ) : stop.email ? (
          <ActionBtn href={`mailto:${stop.email}`} icon={EnvelopeSimple}>
            Email
          </ActionBtn>
        ) : null}
        <Link
          href={`/bookings/${stop.bookingId}`}
          className="flex items-center gap-1.5 rounded-full border border-sand bg-white px-3.5 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:bg-sand/60"
        >
          <ArrowSquareOut size={15} weight="bold" /> Booking
        </Link>
      </div>

      {stop.equipment.length > 0 ? (
        <div className="mt-3 rounded-xl bg-cream p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
              <Wrench size={13} weight="fill" /> {isDeliver ? "Load out" : "Bring back"}
            </span>
            {allLoaded ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-teal">
                <CheckCircle size={13} weight="fill" /> All set
              </span>
            ) : (
              <span className="text-[11px] font-bold text-ink-mute">
                {loaded.size}/{stop.equipment.length}
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-1">
            {stop.equipment.map((e) => {
              const on = loaded.has(e.label);
              return (
                <li key={e.label}>
                  <button
                    type="button"
                    onClick={() => toggleLoaded(e.label)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-white"
                  >
                    <span
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${
                        on ? "border-teal bg-teal text-white" : "border-sand bg-white"
                      }`}
                    >
                      {on ? <CheckCircle size={14} weight="fill" /> : null}
                    </span>
                    <span className={`flex-1 text-[13.5px] font-semibold ${on ? "text-ink-mute line-through" : "text-ink"}`}>
                      {e.label}
                    </span>
                    {e.qty > 1 ? <span className="text-[12px] font-bold text-ink-mute tabular-nums">×{e.qty}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 border-t border-sand-line pt-3">
        {stop.done ? (
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-teal-deep">
            <CheckCircle size={18} weight="fill" /> {isDeliver ? "Delivered" : "Picked up"}
          </div>
        ) : (
          <button
            onClick={onMark}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
          >
            {busy ? (
              <CircleNotch size={16} weight="bold" className="animate-spin" />
            ) : (
              <CheckCircle size={16} weight="fill" />
            )}
            {isDeliver ? "Mark delivered" : "Mark picked up"}
          </button>
        )}
      </div>
    </div>
  );
}
