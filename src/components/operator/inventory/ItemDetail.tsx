"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CaretLeft,
  CaretRight,
  PencilSimple,
  Lightning,
  Ruler,
  Sparkle,
  Wrench,
  Broom,
  Warning,
  Package,
  CalendarBlank,
} from "@phosphor-icons/react/dist/ssr";
import { bookableUnits, outOfServiceUnits, type Item } from "@/lib/inventory/types";
import type { ItemHold } from "@/lib/inventory/availability";
import { ItemDrawer } from "./ItemDrawer";
import { catMeta, money, unitLabel } from "./shared";

/** Live availability of this item over a forward window (from the engine). */
export interface ItemAvailabilitySummary {
  owned: number;
  reserved: number;
  available: number;
  horizonDate: string;
  horizonDays: number;
}

function footprintLabel(f: Item["footprint"]): string | null {
  const parts = [f.w, f.l, f.h];
  if (parts.every((p) => p == null)) return null;
  return parts.map((p) => (p == null ? "—" : `${p}`)).join(" × ") + " ft (W × L × H)";
}

/** "Sat, Jul 25" or "Jul 25 → Jul 27" for a booking's date range. */
function fmtHoldRange(start: string, end: string): string {
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return start === end ? f(start) : `${f(start)} → ${f(end)}`;
}

const HOLD_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Payment pending",
  paid: "Paid",
  contracted: "Contracted",
  confirmed: "Confirmed",
  delivered: "Out now",
};

export function ItemDetail({
  item,
  isAdmin,
  holds,
  availability,
}: {
  item: Item;
  isAdmin: boolean;
  holds: ItemHold[];
  availability: ItemAvailabilitySummary;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [hero, setHero] = useState(0);

  const m = catMeta(item.category);
  const ready = bookableUnits(item);
  const out = outOfServiceUnits(item);
  const footprint = footprintLabel(item.footprint);
  const images = item.images ?? [];
  const heroUrl = images[hero] ?? images[0];

  const conditions = [
    { label: "Needs cleaning", qty: item.unitsNeedsCleaning, Icon: Broom },
    { label: "Damaged", qty: item.unitsDamaged, Icon: Warning },
    { label: "In repair", qty: item.unitsInRepair, Icon: Wrench },
  ].filter((c) => c.qty > 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6 lg:px-8">
      {/* Top row */}
      <div className="flex items-center justify-between">
        <Link
          href="/inventory"
          className="flex items-center gap-1.5 text-sm font-bold text-ink-soft hover:text-ink"
        >
          <CaretLeft size={18} weight="bold" /> Inventory
        </Link>
        {isAdmin ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-ink/90"
          >
            <PencilSimple size={15} weight="bold" /> Edit
          </button>
        ) : null}
      </div>

      {/* Title */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-3xl">{item.name}</h1>
          {!item.active ? (
            <span className="rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-extrabold text-ink-mute">HIDDEN</span>
          ) : null}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink-mute">
          <m.Icon size={16} weight="fill" className={m.ink} /> {m.label}
        </p>
      </div>

      {/* Gallery */}
      {heroUrl ? (
        <div className="flex flex-col gap-2">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-sand-line bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroUrl} alt={item.name} className="h-full w-full object-cover" />
          </div>
          {images.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {images.map((url, i) => (
                <button
                  key={url}
                  onClick={() => setHero(i)}
                  className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                    i === hero ? "border-brand" : "border-sand-line hover:border-sand"
                  }`}
                  aria-label={`Photo ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className={`flex aspect-[4/3] w-full items-center justify-center rounded-2xl ${m.tint}`}>
          <m.Icon size={64} weight="fill" className={m.ink} />
        </div>
      )}

      {/* Price */}
      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold text-ink-soft">Price</span>
          <span className="font-display text-2xl font-bold text-ink">
            {money(item.basePrice)}{" "}
            <span className="text-sm font-semibold text-ink-mute">{unitLabel(item.priceUnit)}</span>
          </span>
        </div>
      </Card>

      {/* Description */}
      {item.description ? (
        <Card>
          <SectionLabel>Description</SectionLabel>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">{item.description}</p>
        </Card>
      ) : null}

      {/* Stock / readiness */}
      <Card>
        <SectionLabel>Stock &amp; readiness</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <Stat value={item.quantity} label="Owned" />
          <Stat value={ready} label="Ready to book" tone={ready > 0 ? "teal" : "mute"} />
          <Stat value={out} label="Out of service" tone={out > 0 ? "amber" : "mute"} />
        </div>
        {conditions.length > 0 ? (
          <div className="mt-3 space-y-1.5 border-t border-sand-line pt-3">
            {conditions.map((c) => (
              <div key={c.label} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-semibold text-ink-soft">
                  <c.Icon size={16} weight="bold" className="text-amber-deep" /> {c.label}
                </span>
                <span className="font-bold text-ink">{c.qty}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12px] font-medium text-ink-mute">All owned units are ready to book.</p>
        )}
      </Card>

      {/* Live availability over the next window + the bookings holding units. */}
      <Card>
        <div className="flex items-center justify-between">
          <SectionLabel>Availability · next {availability.horizonDays} days</SectionLabel>
          <span className="text-[12px] font-semibold text-ink-mute">
            through {fmtHoldRange(availability.horizonDate, availability.horizonDate)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat value={availability.owned} label="Bookable" />
          <Stat
            value={availability.reserved}
            label="Peak booked"
            tone={availability.reserved > 0 ? "amber" : "mute"}
          />
          <Stat
            value={Math.max(0, availability.available)}
            label="Free at peak"
            tone={availability.available > 0 ? "teal" : "mute"}
          />
        </div>
        <p className="mt-2 text-[12px] font-medium text-ink-mute">
          {availability.reserved === 0
            ? `No committed bookings hold this item in the next ${availability.horizonDays} days.`
            : availability.available <= 0
              ? "Fully booked on its busiest upcoming day."
              : `Up to ${availability.reserved} of ${availability.owned} reserved on the busiest upcoming day.`}
        </p>

        {holds.length > 0 ? (
          <div className="mt-3 space-y-1.5 border-t border-sand-line pt-3">
            <div className="mb-1 text-[12px] font-bold text-ink-soft">
              Upcoming bookings ({holds.length})
            </div>
            {holds.map((h) => (
              <Link
                key={h.bookingId}
                href={`/bookings/${h.bookingId}`}
                className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-cream"
              >
                <CalendarBlank size={16} weight="fill" className="flex-shrink-0 text-brand" />
                <span className="flex-shrink-0 text-sm font-bold text-ink">
                  {fmtHoldRange(h.startDate, h.endDate)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-mute">
                  {h.customerName ?? "Customer"}
                  {h.quantity > 1 ? ` · ${h.quantity} units` : ""}
                </span>
                <span className="flex-shrink-0 text-[11px] font-bold text-ink-soft">
                  {HOLD_STATUS_LABEL[h.status] ?? h.status}
                </span>
                <CaretRight size={14} weight="bold" className="flex-shrink-0 text-ink-faint" />
              </Link>
            ))}
          </div>
        ) : null}
      </Card>

      {/* Required equipment */}
      {item.requiredEquipment.length > 0 ? (
        <Card>
          <SectionLabel>Required equipment</SectionLabel>
          <div className="space-y-1.5">
            {item.requiredEquipment.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-semibold text-ink-soft">
                  <Sparkle size={15} weight="fill" className="text-brand" /> {e.label}
                </span>
                <span className="font-bold text-ink">{e.qty > 1 ? `×${e.qty}` : "×1"}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] font-medium text-ink-mute">
            The loadout checklist shown on the deliveries screen.
          </p>
        </Card>
      ) : null}

      {/* Specs */}
      <Card>
        <SectionLabel>Specs</SectionLabel>
        <div className="space-y-1.5">
          <SpecRow Icon={Ruler} label="Footprint" value={footprint ?? "Not set"} muted={!footprint} />
          <SpecRow
            Icon={Lightning}
            label="Power"
            value={item.powerRequired ? "Needs power / a blower" : "No power needed"}
          />
          <SpecRow
            Icon={Package}
            label="Storefront"
            value={item.active ? "Visible to customers" : "Hidden"}
            muted={!item.active}
          />
        </div>
      </Card>

      {editing ? (
        <ItemDrawer
          item={item}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-sand-line bg-white p-4">{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink-faint">{children}</div>
  );
}

function Stat({
  value,
  label,
  tone = "ink",
}: {
  value: number;
  label: string;
  tone?: "ink" | "teal" | "amber" | "mute";
}) {
  const cls =
    tone === "teal"
      ? "text-teal"
      : tone === "amber"
        ? "text-amber-deep"
        : tone === "mute"
          ? "text-ink-mute"
          : "text-ink";
  return (
    <div className="rounded-xl bg-cream px-3 py-2.5 text-center">
      <div className={`font-display text-xl font-bold ${cls}`}>{value}</div>
      <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.03em] text-ink-faint">{label}</div>
    </div>
  );
}

function SpecRow({
  Icon,
  label,
  value,
  muted = false,
}: {
  Icon: typeof Ruler;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 font-semibold text-ink-soft">
        <Icon size={16} weight="bold" className="text-ink-mute" /> {label}
      </span>
      <span className={`font-bold ${muted ? "text-ink-mute" : "text-ink"}`}>{value}</span>
    </div>
  );
}
