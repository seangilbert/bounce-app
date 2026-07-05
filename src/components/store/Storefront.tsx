"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Confetti,
  CastleTurret,
  Tent,
  Chair,
  CalendarBlank,
  Plus,
  Minus,
  CheckCircle,
  ArrowRight,
  X,
  CircleNotch,
  ShieldCheck,
  Truck,
} from "@phosphor-icons/react/dist/ssr";

type Category = "bounce" | "tent" | "tables" | "other";

interface ApiItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  basePrice: number;
  priceUnit: string;
  availability?: { owned: number; reserved: number; available: number };
}
interface ApiResponse {
  operator: { name: string } | null;
  items: ApiItem[];
}

function toCategory(c: string | null): Category {
  if (c === "tent") return "tent";
  if (c === "tables" || c === "furniture") return "tables";
  if (c === "bounce" || c === "bounce_house" || c === "combo" || c === "obstacle" || c === "water_slide")
    return "bounce";
  return "other";
}

const CAT_META: Record<Category, { label: string; tint: string; ink: string; Icon: typeof Tent }> = {
  bounce: { label: "Bounce house", tint: "bg-brand-tint", ink: "text-brand", Icon: CastleTurret },
  tent: { label: "Tent", tint: "bg-teal-tint", ink: "text-teal", Icon: Tent },
  tables: { label: "Tables & chairs", tint: "bg-amber-tint", ink: "text-amber-deep", Icon: Chair },
  other: { label: "Add-on", tint: "bg-sand", ink: "text-ink-soft", Icon: Confetti },
};

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function Storefront() {
  const [date, setDate] = useState(nextSaturday);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/items?start=${date}&end=${date}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => active && setData(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [date]);

  const items = data?.items ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const setQty = (id: string, qty: number) =>
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  const cartLines = Object.entries(cart)
    .map(([id, qty]) => ({ item: byId.get(id), qty }))
    .filter((l): l is { item: ApiItem; qty: number } => Boolean(l.item));
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const subtotal = cartLines.reduce((s, l) => s + l.item.basePrice * l.qty, 0);

  return (
    <div className="min-h-dvh bg-cream pb-28">
      {/* Header */}
      <header className="border-b border-sand bg-cream/90 px-5 py-4 backdrop-blur lg:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-white">
              <Confetti size={20} weight="fill" />
            </span>
            <div>
              <div className="font-display text-lg font-extrabold tracking-tight text-ink">
                {data?.operator?.name ?? "Bounce USA"}
              </div>
              <div className="text-xs font-semibold text-ink-mute">Party &amp; event rentals</div>
            </div>
          </div>
          <a
            href="tel:+15085551234"
            className="rounded-full border border-sand bg-white px-4 py-2 text-sm font-bold text-ink-soft"
          >
            (508) 555-1234
          </a>
        </div>
      </header>

      {/* Hero + date picker */}
      <section className="px-5 pt-10 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <h1 className="max-w-2xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink lg:text-5xl">
            Bouncy fun, delivered to your party.
          </h1>
          <p className="mt-3 max-w-xl text-base font-medium text-ink-soft">
            Pick your date and we&apos;ll show you what&apos;s available. Delivery, setup, and
            pickup included.
          </p>

          <div className="mt-6 inline-flex flex-wrap items-center gap-3 rounded-2xl border border-sand bg-white p-2.5 shadow-sm">
            <label className="flex items-center gap-2.5 px-2">
              <CalendarBlank size={20} weight="fill" className="text-brand" />
              <span className="text-sm font-bold text-ink-soft">Event date</span>
            </label>
            <input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-sand bg-cream px-3 py-2 text-sm font-bold text-ink outline-none focus:border-brand"
            />
            <span className="px-2 text-sm font-semibold text-ink-mute">{prettyDate(date)}</span>
          </div>
        </div>
      </section>

      {/* Catalog */}
      <section className="px-5 pt-10 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl font-bold text-ink">Available for {prettyDate(date)}</h2>
          {loading ? (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-72 animate-pulse rounded-2xl bg-sand/50" />
              ))}
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} qty={cart[item.id] ?? 0} onQty={(q) => setQty(item.id, q)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Cart bar */}
      {cartCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sand bg-white/95 px-5 py-3.5 backdrop-blur lg:px-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="text-sm font-semibold text-ink-soft">
              <span className="font-display text-lg font-extrabold text-ink">{money(subtotal)}</span>{" "}
              · {cartCount} {cartCount === 1 ? "item" : "items"} · {prettyDate(date)}
            </div>
            <button
              onClick={() => setCheckoutOpen(true)}
              className="flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-deep"
            >
              Review &amp; book <ArrowRight size={16} weight="bold" />
            </button>
          </div>
        </div>
      ) : null}

      {checkoutOpen ? (
        <CheckoutDrawer
          date={date}
          lines={cartLines}
          subtotal={subtotal}
          onClose={() => setCheckoutOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CheckoutDrawer({
  date,
  lines,
  subtotal,
  onClose,
}: {
  date: string;
  lines: { item: ApiItem; qty: number }[];
  subtotal: number;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", zip: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = form.name.trim() && /.+@.+\..+/.test(form.email) && form.address.trim();

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const bRes = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: date,
          items: lines.map((l) => ({ itemId: l.item.id, quantity: l.qty })),
          customerName: form.name,
          customerEmail: form.email,
          deliveryAddress: form.address,
          deliveryZip: form.zip || undefined,
        }),
      });
      const bJson = await bRes.json();
      if (!bRes.ok) throw new Error(bJson.error ?? "Could not create your booking.");

      const cRes = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: bJson.booking.id,
          successUrl: `${location.origin}/book/success`,
          cancelUrl: `${location.origin}/book`,
        }),
      });
      const cJson = await cRes.json();
      if (!cRes.ok || !cJson.url) throw new Error(cJson.error ?? "Could not start checkout.");
      location.href = cJson.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">Review &amp; book</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-ink-soft"
            aria-label="Close"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-5">
          <div className="text-sm font-semibold text-ink-mute">{prettyDate(date)}</div>

          <div className="rounded-2xl border border-sand-line bg-white p-4">
            {lines.map((l) => (
              <div key={l.item.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="font-semibold text-ink">
                  {l.qty > 1 ? `${l.qty}× ` : ""}
                  {l.item.name}
                </span>
                <span className="font-bold text-ink">{money(l.item.basePrice * l.qty)}</span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-sand-line pt-2.5">
              <span className="font-bold text-ink">Total</span>
              <span className="font-display text-lg font-extrabold text-ink">{money(subtotal)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl bg-brand-tint p-4 text-[13px] font-semibold text-brand-deep">
            <span className="flex items-center gap-2">
              <Truck size={16} weight="fill" /> Free delivery, setup &amp; pickup
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck size={16} weight="fill" /> Secure payment · e-signed rental agreement
            </span>
          </div>

          <div className="space-y-3">
            <Field label="Full name" value={form.name} onChange={field("name")} placeholder="Jane Smith" />
            <Field label="Email" value={form.email} onChange={field("email")} placeholder="jane@email.com" type="email" />
            <Field label="Phone (optional)" value={form.phone} onChange={field("phone")} placeholder="(508) 555-0000" />
            <Field label="Delivery address" value={form.address} onChange={field("address")} placeholder="14 Oak St, Plymouth" />
            <Field label="ZIP" value={form.zip} onChange={field("zip")} placeholder="02360" />
          </div>

          {error ? (
            <div className="rounded-xl bg-coral-tint px-4 py-3 text-sm font-semibold text-coral-deep">
              {error}
            </div>
          ) : null}
        </div>

        <div className="border-t border-sand px-5 py-4">
          <button
            onClick={submit}
            disabled={!valid || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
          >
            {submitting ? (
              <>
                <CircleNotch size={18} weight="bold" className="animate-spin" /> Starting checkout…
              </>
            ) : (
              <>Pay {money(subtotal)} deposit</>
            )}
          </button>
          <p className="mt-2 text-center text-xs font-medium text-ink-mute">
            You&apos;ll confirm on the next screen. No charge until you pay.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-bold text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:border-brand"
      />
    </label>
  );
}

function ItemCard({
  item,
  qty,
  onQty,
}: {
  item: ApiItem;
  qty: number;
  onQty: (q: number) => void;
}) {
  const cat = toCategory(item.category);
  const meta = CAT_META[cat];
  const available = item.availability?.available ?? 0;
  const soldOut = item.availability != null && available <= 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-sand-line bg-white">
      <div className={`flex h-40 items-center justify-center ${meta.tint}`}>
        <meta.Icon size={56} weight="fill" className={meta.ink} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-ink">{item.name}</div>
            <div className="text-xs font-semibold text-ink-mute">{meta.label}</div>
          </div>
          {item.availability != null ? (
            soldOut ? (
              <span className="flex-shrink-0 rounded-full bg-coral-tint px-2.5 py-1 text-[11px] font-extrabold text-coral-deep">
                Booked
              </span>
            ) : (
              <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-teal-tint px-2.5 py-1 text-[11px] font-extrabold text-teal-deep">
                <CheckCircle size={11} weight="fill" />
                {available} available
              </span>
            )
          ) : null}
        </div>

        {item.description ? (
          <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-ink-soft">
            {item.description}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between pt-4">
          <div className="font-display text-xl font-bold text-ink">
            {money(item.basePrice)}{" "}
            <span className="text-sm font-medium text-ink-mute">
              {item.priceUnit === "flat" ? "flat" : "/ day"}
            </span>
          </div>
          {qty > 0 ? (
            <div className="flex items-center gap-3 rounded-full border border-sand bg-white px-1.5 py-1">
              <button
                onClick={() => onQty(qty - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-sand"
                aria-label="Decrease"
              >
                <Minus size={14} weight="bold" />
              </button>
              <span className="w-4 text-center font-display font-bold text-ink">{qty}</span>
              <button
                onClick={() => onQty(qty + 1)}
                disabled={qty >= available}
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-sand disabled:opacity-30"
                aria-label="Increase"
              >
                <Plus size={14} weight="bold" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onQty(1)}
              disabled={soldOut}
              className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
            >
              <Plus size={14} weight="bold" /> Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
