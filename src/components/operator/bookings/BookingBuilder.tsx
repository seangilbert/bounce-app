"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Plus,
  Minus,
  CircleNotch,
  PaperPlaneTilt,
  CheckCircle,
  CalendarBlank,
} from "@phosphor-icons/react/dist/ssr";
import { priceBreakdown } from "@/lib/inventory/pricing";
import { previewDeliveryFeeAction, type DeliveryFeePreview } from "@/lib/delivery/actions";
import { depositAmount, DEPOSIT_PERCENT } from "@/lib/deposit";
import { createOperatorBookingAction } from "@/app/(operator)/bookings/actions";

interface BuilderItem {
  id: string;
  name: string;
  basePrice: number;
  priceUnit: string;
  images?: string[];
  availability?: { available: number };
}
interface OpConfig {
  depositPercent?: number;
  taxPercent?: number;
  deliveryFeeCents?: number;
  deliveryTaxable?: boolean;
  deliveryMode?: "flat" | "zones" | "distance";
}
export interface BookingPrefill {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  startDate?: string;
  endDate?: string;
  items?: { itemId: string; quantity: number }[];
  inquiryId?: string;
  /** Cover note (e.g. the AI's drafted message) — sent atop the quote email. */
  message?: string;
}

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function durationDays(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}
function lineTotalOf(item: BuilderItem, qty: number, days: number): number {
  const oneTime = item.priceUnit === "flat" || item.priceUnit === "per_hour";
  return item.basePrice * qty * (oneTime ? 1 : days);
}

export function BookingBuilder({
  operatorId,
  initial,
  onClose,
}: {
  operatorId: string;
  initial?: BookingPrefill;
  onClose: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(initial?.startDate ?? today());
  const [endDate, setEndDate] = useState(initial?.endDate ?? initial?.startDate ?? today());
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [op, setOp] = useState<OpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>(
    () => Object.fromEntries((initial?.items ?? []).map((i) => [i.itemId, i.quantity])),
  );
  const [form, setForm] = useState({
    name: initial?.customerName ?? "",
    email: initial?.customerEmail ?? "",
    phone: initial?.customerPhone ?? "",
    address: "",
    zip: "",
  });
  const [message, setMessage] = useState(initial?.message ?? "");
  const [paymentType, setPaymentType] = useState<"deposit" | "full">("deposit");
  const [depositCash, setDepositCash] = useState("");
  const [feePreview, setFeePreview] = useState<DeliveryFeePreview | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [overrideFee, setOverrideFee] = useState("");
  const [busy, setBusy] = useState<null | "link" | "manual">(null);
  const [error, setError] = useState<string | null>(null);
  const [sentLink, setSentLink] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/items?operator=${operatorId}&start=${date}&end=${endDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setItems(d.items ?? []);
        setOp(d.operator ?? null);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [operatorId, date, endDate]);

  const days = durationDays(date, endDate);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const setQty = (id: string, q: number) =>
    setCart((c) => {
      const n = { ...c };
      if (q <= 0) delete n[id];
      else n[id] = q;
      return n;
    });
  const cartLines = Object.entries(cart)
    .map(([id, qty]) => ({ item: byId.get(id), qty }))
    .filter((l): l is { item: BuilderItem; qty: number } => Boolean(l.item));
  const subtotal = cartLines.reduce((s, l) => s + lineTotalOf(l.item, l.qty, days), 0);
  const mode = op?.deliveryMode ?? "flat";
  const overrideCents =
    overrideFee.trim() !== "" ? Math.max(0, Math.round(parseFloat(overrideFee) * 100)) : null;
  const effectiveDeliveryFee =
    overrideCents != null
      ? overrideCents
      : mode === "flat"
        ? op?.deliveryFeeCents ?? 0
        : feePreview?.feeCents ?? 0;
  const bd = priceBreakdown(subtotal, effectiveDeliveryFee, op?.taxPercent ?? 0, op?.deliveryTaxable ?? true);
  const deposit = depositAmount(bd.total, op?.depositPercent ?? DEPOSIT_PERCENT);

  // Resolve the delivery fee server-side for zones/distance operators once an
  // address is entered (skipped when the operator typed an explicit override).
  useEffect(() => {
    if (mode === "flat" || overrideCents != null) return;
    const address = form.address.trim();
    const zip = form.zip.trim();
    if (!address && !zip) {
      setFeePreview(null);
      return;
    }
    let cancelled = false;
    setFeeLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await previewDeliveryFeeAction({ operatorId, zip, address });
        if (!cancelled) setFeePreview(res);
      } finally {
        if (!cancelled) setFeeLoading(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, overrideCents, operatorId, form.address, form.zip]);
  const changeStart = (v: string) => {
    setDate(v);
    if (endDate < v) setEndDate(v);
  };

  const valid = form.name.trim() && /.+@.+\..+/.test(form.email.trim()) && cartLines.length > 0;

  async function submit(mode: "link" | "manual") {
    if (!valid) {
      setError("Add a customer name, a valid email, and at least one item.");
      return;
    }
    setBusy(mode);
    setError(null);
    const res = await createOperatorBookingAction({
      mode,
      paymentType,
      customerName: form.name.trim(),
      customerEmail: form.email.trim(),
      customerPhone: form.phone.trim() || undefined,
      deliveryAddress: form.address.trim() || undefined,
      deliveryZip: form.zip.trim() || undefined,
      deliveryFeeOverrideCents: overrideCents ?? undefined,
      startDate: date,
      endDate,
      items: cartLines.map((l) => ({ itemId: l.item.id, quantity: l.qty })),
      message: message.trim() || undefined,
      inquiryId: initial?.inquiryId,
      depositCents: mode === "manual" && depositCash ? Math.round(parseFloat(depositCash) * 100) : undefined,
    });
    if (!res.ok) {
      setError(res.error);
      setBusy(null);
      return;
    }
    if (mode === "manual") {
      router.refresh();
      onClose();
    } else {
      setSentLink(true);
      router.refresh();
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-sand px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">New quote / booking</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-ink-soft"
            aria-label="Close"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {sentLink ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <CheckCircle size={44} weight="fill" className="text-teal" />
            <h3 className="font-display text-xl font-bold text-ink">Quote sent</h3>
            <p className="max-w-xs text-sm font-medium text-ink-mute">
              We emailed {form.email} a link to review and reserve. You&apos;ll see it as a booking once they pay.
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-deep"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {/* Dates */}
              <Field label="Rental dates">
                <div className="flex items-center gap-2 rounded-xl border border-sand bg-white px-3 py-2.5">
                  <CalendarBlank size={18} weight="fill" className="text-brand" />
                  <input
                    type="date"
                    aria-label="Start date"
                    value={date}
                    min={today()}
                    onChange={(e) => changeStart(e.target.value)}
                    className="bg-transparent text-sm font-bold text-ink outline-none"
                  />
                  <span className="text-ink-faint">→</span>
                  <input
                    type="date"
                    aria-label="End date"
                    value={endDate}
                    min={date}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent text-sm font-bold text-ink outline-none"
                  />
                </div>
              </Field>

              {/* Items */}
              <Field label="Items">
                {loading ? (
                  <div className="py-6 text-center text-sm text-ink-mute">Loading catalog…</div>
                ) : items.length === 0 ? (
                  <div className="py-6 text-center text-sm text-ink-mute">No items in your catalog.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map((item) => {
                      const qty = cart[item.id] ?? 0;
                      const avail = item.availability?.available ?? 99;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-xl border border-sand-line bg-white p-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-ink">{item.name}</div>
                            <div className="text-xs font-medium text-ink-mute">
                              {money(item.basePrice)} {item.priceUnit === "flat" ? "flat" : "/ day"} ·{" "}
                              {avail} available
                            </div>
                          </div>
                          {qty > 0 ? (
                            <div className="flex items-center gap-2.5 rounded-full border border-sand bg-white px-1.5 py-1">
                              <button
                                onClick={() => setQty(item.id, qty - 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-sand"
                                aria-label="Decrease"
                              >
                                <Minus size={14} weight="bold" />
                              </button>
                              <span className="w-4 text-center font-display font-bold text-ink">{qty}</span>
                              <button
                                onClick={() => setQty(item.id, qty + 1)}
                                disabled={qty >= avail}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-sand disabled:opacity-30"
                                aria-label="Increase"
                              >
                                <Plus size={14} weight="bold" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setQty(item.id, 1)}
                              disabled={avail <= 0}
                              className="flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-sm font-bold text-white hover:bg-brand-deep disabled:bg-sand disabled:text-ink-mute"
                            >
                              <Plus size={14} weight="bold" /> Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Field>

              {/* Customer */}
              <Field label="Customer">
                <div className="space-y-2.5">
                  <div className="flex gap-2.5">
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Full name"
                      className="input flex-1"
                    />
                    <input
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="Phone (optional)"
                      className="input w-40"
                    />
                  </div>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Email (for the quote / receipt)"
                    className="input"
                  />
                  <div className="flex gap-2.5">
                    <input
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                      placeholder="Delivery address (optional)"
                      className="input flex-1"
                    />
                    <input
                      value={form.zip}
                      onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                      placeholder="ZIP"
                      className="input w-24"
                    />
                  </div>
                  {mode !== "flat" ? (
                    <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-mute">
                      <span>
                        Delivery:{" "}
                        {overrideCents != null
                          ? "overridden"
                          : feeLoading
                            ? "calculating…"
                            : feePreview?.outOfArea
                              ? "outside area — set an override"
                              : feePreview?.needsLocation
                                ? "enter address"
                                : feePreview?.feeCents != null
                                  ? `${money(feePreview.feeCents)}${feePreview.label ? ` · ${feePreview.label}` : ""}`
                                  : "—"}
                      </span>
                      <input
                        value={overrideFee}
                        onChange={(e) => setOverrideFee(e.target.value)}
                        placeholder="Override $"
                        inputMode="decimal"
                        className="input ml-auto w-28"
                      />
                    </div>
                  ) : null}
                </div>
              </Field>

              {/* Price preview */}
              {cartLines.length > 0 ? (
                <div className="rounded-2xl bg-white p-4">
                  <div className="space-y-1 text-sm">
                    {cartLines.map((l) => (
                      <div key={l.item.id} className="flex justify-between text-ink-mute">
                        <span>
                          {l.qty > 1 ? `${l.qty}× ` : ""}
                          {l.item.name}
                        </span>
                        <span className="font-semibold text-ink">{money(lineTotalOf(l.item, l.qty, days))}</span>
                      </div>
                    ))}
                    {bd.deliveryFee > 0 ? (
                      <div className="flex justify-between text-ink-mute">
                        <span>Delivery</span>
                        <span className="font-semibold text-ink">{money(bd.deliveryFee)}</span>
                      </div>
                    ) : null}
                    {bd.tax > 0 ? (
                      <div className="flex justify-between text-ink-mute">
                        <span>Sales tax</span>
                        <span className="font-semibold text-ink">{money(bd.tax)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-t border-sand-line pt-1.5">
                      <span className="font-bold text-ink">Total</span>
                      <span className="font-display text-lg font-extrabold text-ink">{money(bd.total)}</span>
                    </div>
                    <div className="text-right text-xs font-semibold text-ink-mute">
                      Deposit ({op?.depositPercent ?? DEPOSIT_PERCENT}%): {money(deposit)}
                    </div>
                  </div>
                </div>
              ) : null}

              <Field label="Note to the customer (optional)">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="A short message sent above the quote in the payment-link email."
                  className="input resize-none"
                />
              </Field>

              {error ? (
                <div className="rounded-xl bg-coral-tint px-4 py-3 text-sm font-semibold text-coral-deep">{error}</div>
              ) : null}
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 space-y-3 border-t border-sand px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">Charge</span>
                <div className="flex rounded-full bg-sand/70 p-1">
                  {(["deposit", "full"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setPaymentType(t)}
                      className={`rounded-full px-3.5 py-1 text-xs font-bold capitalize transition-colors ${
                        paymentType === t ? "bg-white text-ink shadow-sm" : "text-ink-soft"
                      }`}
                    >
                      {t === "deposit" ? "Deposit" : "Full"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  onClick={() => submit("link")}
                  disabled={busy !== null || !valid}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
                >
                  {busy === "link" ? (
                    <CircleNotch size={16} weight="bold" className="animate-spin" />
                  ) : (
                    <PaperPlaneTilt size={16} weight="fill" />
                  )}
                  Send payment link
                </button>
                <button
                  onClick={() => submit("manual")}
                  disabled={busy !== null || !valid}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-sand bg-white px-5 py-3 text-sm font-bold text-ink-soft transition-colors hover:bg-sand disabled:opacity-50"
                >
                  {busy === "manual" ? <CircleNotch size={16} weight="bold" className="animate-spin" /> : null}
                  Record as booked
                </button>
              </div>
              <p className="text-center text-[11px] font-medium text-ink-mute">
                Payment link emails the customer to pay + reserve. &ldquo;Record as booked&rdquo; confirms it now
                (cash / phone order).
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
