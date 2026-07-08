"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
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
  Sparkle,
  Heart,
  PaperPlaneTilt,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { DEPOSIT_PERCENT, depositAmount } from "@/lib/deposit";
import { priceBreakdown } from "@/lib/inventory/pricing";
import { brandVars } from "@/lib/branding/palette";
import { StoreSidebar } from "./StoreSidebar";
import { StoreBottomNav } from "./StoreBottomNav";
import { LightboxProvider, useLightbox } from "./Lightbox";

type Category = "bounce" | "tent" | "tables" | "other";

interface ApiItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  basePrice: number;
  priceUnit: string;
  images?: string[];
  availability?: { owned: number; reserved: number; available: number };
}
interface ApiResponse {
  operator: {
    name: string;
    depositPercent?: number;
    taxPercent?: number;
    deliveryFeeCents?: number;
  } | null;
  items: ApiItem[];
}

interface QuoteLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}
type ChatMsg = { role: "user" | "assistant"; content: string };
interface QuoteBreakdown {
  lineItems: QuoteLine[];
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  suggestedDeposit: number;
  currency: string;
}
interface ConversationResult {
  reply: string;
  status: "gathering" | "quoted" | "review";
  eventDate: string | null;
  quote: QuoteBreakdown | null;
  auto: boolean;
  unmatchedRequests: string[];
  inquiryId: string | null;
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

/** Inclusive rental length in days (start === end → 1 day). */
function durationDays(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}

/** Client estimate of a line total: per_day scales with length; flat/per_hour are one-time. */
function lineTotalOf(item: ApiItem, qty: number, days: number): number {
  const oneTime = item.priceUnit === "flat" || item.priceUnit === "per_hour";
  return item.basePrice * qty * (oneTime ? 1 : days);
}

function rangeLabel(start: string, end: string): string {
  if (start === end) return prettyDate(start);
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function StoreShell({
  operatorId,
  slug,
  brandColor,
  operatorName,
}: {
  operatorId?: string;
  slug: string;
  brandColor?: string | null;
  operatorName?: string;
}) {
  const opParam = operatorId ? `&operator=${operatorId}` : "";
  const [date, setDate] = useState(nextSaturday);
  const [endDate, setEndDate] = useState(nextSaturday);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutInquiryId, setCheckoutInquiryId] = useState<string | null>(null);

  const days = durationDays(date, endDate);

  // Keep the end date on/after the start date.
  const changeStart = (v: string) => {
    setDate(v);
    if (endDate < v) setEndDate(v);
  };

  // AI Instant Quote — conversational
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatQuote, setChatQuote] = useState<ConversationResult["quote"]>(null);
  const [chatDate, setChatDate] = useState<string | null>(null);
  const [chatInquiryId, setChatInquiryId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatStatus, setChatStatus] = useState<ConversationResult["status"] | null>(null);
  // Contact capture when the AI escalates ("review") so the operator can reply back.
  const [contactEmail, setContactEmail] = useState("");
  const [contactSaved, setContactSaved] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactErr, setContactErr] = useState<string | null>(null);

  async function submitContact() {
    const email = contactEmail.trim();
    if (!/.+@.+\..+/.test(email) || !chatInquiryId || !operatorId) return;
    setContactBusy(true);
    setContactErr(null);
    try {
      const res = await fetch("/api/inquiries/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiryId: chatInquiryId, operatorId, email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save that.");
      setContactSaved(true);
    } catch (e) {
      setContactErr(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setContactBusy(false);
    }
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const next: ChatMsg[] = [...chat, { role: "user", content: text }];
    setChat(next);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          startDate: chatDate ?? undefined,
          inquiryId: chatInquiryId ?? undefined,
          operatorId,
        }),
      });
      const json = (await res.json()) as ConversationResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't respond right now.");
      setChat((c) => [...c, { role: "assistant", content: json.reply }]);
      if (json.eventDate) setChatDate(json.eventDate);
      if (json.inquiryId) setChatInquiryId(json.inquiryId);
      setChatQuote(json.quote);
      setChatStatus(json.status);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setChatLoading(false);
    }
  }

  function bookChatQuote() {
    if (!chatQuote) return;
    if (chatDate) {
      setDate(chatDate);
      setEndDate(chatDate);
    }
    setCart(Object.fromEntries(chatQuote.lineItems.map((l) => [l.itemId, l.quantity])));
    setCheckoutInquiryId(chatInquiryId); // tie the resulting booking to this inquiry
    setCheckoutOpen(true);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/items?start=${date}&end=${endDate}${opParam}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => active && setData(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [date, endDate, opParam]);

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
  const subtotal = cartLines.reduce((s, l) => s + lineTotalOf(l.item, l.qty, days), 0);

  const base = `/s/${slug}`;
  const pathname = usePathname();
  const view = pathname.startsWith(`${base}/inventory`)
    ? "inventory"
    : pathname.startsWith(`${base}/saved`)
      ? "saved"
      : pathname.startsWith(`${base}/inspiration`)
        ? "inspiration"
        : "chat";

  const opName = operatorName ?? data?.operator?.name ?? "Bounce USA";
  const range = rangeLabel(date, endDate);

  // Catalog header (title + date range) — shared by the Chat and Inventory views.
  const catalogHeader = (
    <div className="flex flex-shrink-0 flex-wrap items-end justify-between gap-3 px-5 pb-4 pt-6 lg:px-8 lg:pt-7">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Browse the catalog</h2>
        <p className="mt-0.5 text-sm font-medium text-ink-mute">
          Available {range}
          {days > 1 ? ` · ${days}-day rental` : ""}
        </p>
      </div>
      <DateRange date={date} endDate={endDate} changeStart={changeStart} setEndDate={setEndDate} />
    </div>
  );

  const inventoryScroller = (
    <div className="flex-1 overflow-y-auto px-5 pb-8 lg:min-h-0 lg:px-8">
      <InventoryGrid items={items} loading={loading} cart={cart} setQty={setQty} />
    </div>
  );

  const cartBar =
    cartCount > 0 ? (
      <CartBar
        subtotal={subtotal}
        cartCount={cartCount}
        range={range}
        onReview={() => {
          setCheckoutInquiryId(null); // catalog booking — not from an inquiry
          setCheckoutOpen(true);
        }}
      />
    ) : null;

  return (
    <LightboxProvider>
    <div
      className={`flex min-h-dvh w-full bg-cream ${cartCount > 0 ? "pb-36" : "pb-20"} lg:h-dvh lg:overflow-hidden lg:pb-0`}
      style={brandVars(brandColor)}
    >
      <StoreSidebar base={base} operatorName={opName} phone="(508) 555-1234" />

      <div className="flex min-w-0 flex-1 flex-col lg:h-dvh lg:min-h-0">
        {/* Mobile-only top bar — the rail carries the brand on desktop. */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-sand bg-cream/90 px-5 py-3.5 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
              <Confetti size={18} weight="fill" />
            </span>
            <span className="font-display text-base font-extrabold tracking-tight text-ink">
              {opName}
            </span>
          </div>
          <a
            href="tel:+15085551234"
            className="rounded-full border border-sand bg-white px-3.5 py-1.5 text-sm font-bold text-ink-soft"
          >
            (508) 555-1234
          </a>
        </header>

        <main className="flex flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
          {view === "chat" ? (
            /* Chat = AI agent (left) + full inventory (right). Desktop locks each
               column to its own scroll; mobile stacks agent-on-top, page scrolls. */
            <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
              {/* LEFT — AI agent. White surface so the cream chat bubbles read. */}
              <section className="flex flex-col border-b border-sand bg-white lg:w-1/3 lg:min-h-0 lg:border-b-0 lg:border-r">
                <div className="flex-shrink-0 px-5 pt-6 lg:px-7 lg:pt-7">
                  <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-ink lg:text-[28px]">
                    Bouncy fun, delivered to your party.
                  </h1>
                  <p className="mt-2 text-sm font-medium text-ink-soft">
                    Tell me about your event for an instant quote — or browse the full lineup.
                    Delivery, setup &amp; pickup always included.
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <Sparkle size={16} weight="fill" className="text-brand" />
                    <span className="text-sm font-extrabold text-ink">Instant quote</span>
                    <span className="text-xs font-semibold text-ink-mute">· answers in seconds, 24/7</span>
                  </div>
                </div>

                {/* Transcript — capped + scrolls on mobile, fills the column on desktop. */}
                <div className="mt-4 flex max-h-[24rem] flex-1 flex-col gap-3 overflow-y-auto px-5 lg:max-h-none lg:min-h-0 lg:px-7">
                  <ChatBubble role="assistant">
                    Hi! Tell me about your event — what are you thinking, and when? I&apos;ll pull
                    together a quote.
                  </ChatBubble>
                  {chat.map((m, i) => (
                    <ChatBubble key={i} role={m.role}>
                      {m.content}
                    </ChatBubble>
                  ))}
                  {chatQuote ? (
                    <ChatQuoteCard quote={chatQuote} date={chatDate} onBook={bookChatQuote} byId={byId} />
                  ) : null}
                  {/* Escalated to the operator — capture an email so they can reply back. */}
                  {chatStatus === "review" && chatInquiryId && operatorId ? (
                    <ContactCapture
                      operatorName={opName}
                      email={contactEmail}
                      onEmail={setContactEmail}
                      onSubmit={submitContact}
                      saved={contactSaved}
                      busy={contactBusy}
                      error={contactErr}
                    />
                  ) : null}
                  {chatLoading ? (
                    <ChatBubble role="assistant">
                      <TypingDots />
                    </ChatBubble>
                  ) : null}
                  {chatError ? (
                    <div className="rounded-xl bg-coral-tint px-4 py-2.5 text-sm font-semibold text-coral-deep">
                      {chatError}
                    </div>
                  ) : null}
                </div>

                {/* Input — pinned to the bottom of the column. */}
                <div className="flex-shrink-0 px-5 py-4 lg:px-7">
                  <div className="flex items-center gap-2 rounded-xl border border-sand bg-cream px-2 py-1.5">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          sendChat();
                        }
                      }}
                      placeholder="e.g. A bounce house for my 5-year-old's birthday"
                      className="min-w-0 flex-1 bg-transparent px-2 text-sm font-medium text-ink outline-none placeholder:text-ink-faint"
                    />
                    <button
                      onClick={sendChat}
                      disabled={!chatInput.trim() || chatLoading}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand text-white transition-colors hover:bg-brand-deep disabled:bg-sand disabled:text-ink-mute"
                      aria-label="Send"
                    >
                      {chatLoading ? (
                        <CircleNotch size={16} weight="bold" className="animate-spin" />
                      ) : (
                        <PaperPlaneTilt size={16} weight="fill" />
                      )}
                    </button>
                  </div>
                </div>
              </section>

              {/* RIGHT — full inventory. Header pinned, grid scrolls on desktop. */}
              <section className="flex flex-1 flex-col bg-cream lg:min-h-0 lg:w-2/3">
                {catalogHeader}
                {inventoryScroller}
              </section>
            </div>
          ) : view === "inventory" ? (
            /* Inventory-only — the full catalog, edge to edge. */
            <section className="flex flex-1 flex-col bg-cream lg:min-h-0">
              {catalogHeader}
              {inventoryScroller}
            </section>
          ) : view === "saved" ? (
            <EmptyState
              icon={Heart}
              title="Nothing saved yet"
              body="Save rentals you love and they'll show up here, ready to add to your next event."
            />
          ) : (
            <EmptyState
              icon={Sparkle}
              title="Inspiration is on the way"
              body="Party themes, crowd-favorite combos, and setup ideas — curated for your events. Check back soon."
            />
          )}
        </main>

        {/* Desktop cart bar — in-flow footer beneath the content column. */}
        {cartBar ? <div className="hidden flex-shrink-0 lg:block">{cartBar}</div> : null}
      </div>

      {/* Mobile bottom stack — cart bar (when present) sits above the tab bar. */}
      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        {cartBar}
        <StoreBottomNav base={base} />
      </div>

      {checkoutOpen ? (
        <CheckoutDrawer
          date={date}
          endDate={endDate}
          days={days}
          lines={cartLines}
          subtotal={subtotal}
          operatorId={operatorId}
          inquiryId={checkoutInquiryId}
          depositPercent={data?.operator?.depositPercent ?? DEPOSIT_PERCENT}
          taxPercent={data?.operator?.taxPercent ?? 0}
          deliveryFeeCents={data?.operator?.deliveryFeeCents ?? 0}
          onClose={() => setCheckoutOpen(false)}
        />
      ) : null}
    </div>
    </LightboxProvider>
  );
}

function CheckoutDrawer({
  date,
  endDate,
  days,
  lines,
  subtotal,
  operatorId,
  inquiryId,
  depositPercent,
  taxPercent,
  deliveryFeeCents,
  onClose,
}: {
  date: string;
  endDate: string;
  days: number;
  lines: { item: ApiItem; qty: number }[];
  subtotal: number;
  operatorId?: string;
  inquiryId?: string | null;
  depositPercent: number;
  taxPercent: number;
  deliveryFeeCents: number;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", zip: "" });
  const [payType, setPayType] = useState<"deposit" | "full">("deposit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = form.name.trim() && /.+@.+\..+/.test(form.email) && form.address.trim();

  const bd = priceBreakdown(subtotal, deliveryFeeCents, taxPercent);
  const deposit = depositAmount(bd.total, depositPercent);
  const balance = bd.total - deposit;
  const amountNow = payType === "deposit" ? deposit : bd.total;

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
          endDate,
          items: lines.map((l) => ({ itemId: l.item.id, quantity: l.qty })),
          customerName: form.name,
          customerEmail: form.email,
          customerPhone: form.phone || undefined,
          inquiryId: inquiryId ?? undefined,
          deliveryAddress: form.address,
          deliveryZip: form.zip || undefined,
          operatorId,
        }),
      });
      const bJson = await bRes.json();
      if (!bRes.ok) throw new Error(bJson.error ?? "Could not create your booking.");

      const cRes = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: bJson.booking.id,
          paymentType: payType,
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
          <div className="text-sm font-semibold text-ink-mute">
            {rangeLabel(date, endDate)}
            {days > 1 ? ` · ${days} days` : ""}
          </div>

          <div className="rounded-2xl border border-sand-line bg-white p-4">
            {lines.map((l) => (
              <div key={l.item.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                <QuoteThumb item={l.item} />
                <span className="min-w-0 flex-1 font-semibold text-ink">
                  {l.qty > 1 ? `${l.qty}× ` : ""}
                  {l.item.name}
                  {days > 1 && l.item.priceUnit !== "flat" ? (
                    <span className="font-medium text-ink-mute"> · {days} days</span>
                  ) : null}
                </span>
                <span className="flex-shrink-0 font-bold text-ink">{money(lineTotalOf(l.item, l.qty, days))}</span>
              </div>
            ))}
            <div className="mt-2 space-y-1 border-t border-sand-line pt-2.5 text-sm">
              {bd.deliveryFee > 0 || bd.tax > 0 ? (
                <div className="flex items-center justify-between text-ink-mute">
                  <span>Subtotal</span>
                  <span className="font-semibold text-ink">{money(bd.subtotal)}</span>
                </div>
              ) : null}
              {bd.deliveryFee > 0 ? (
                <div className="flex items-center justify-between text-ink-mute">
                  <span>Delivery</span>
                  <span className="font-semibold text-ink">{money(bd.deliveryFee)}</span>
                </div>
              ) : null}
              {bd.tax > 0 ? (
                <div className="flex items-center justify-between text-ink-mute">
                  <span>Sales tax</span>
                  <span className="font-semibold text-ink">{money(bd.tax)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between pt-0.5">
                <span className="font-bold text-ink">Total</span>
                <span className="font-display text-lg font-extrabold text-ink">{money(bd.total)}</span>
              </div>
            </div>
          </div>

          {/* Deposit vs full */}
          <div>
            <div className="mb-2 text-[13px] font-bold text-ink-soft">How would you like to pay?</div>
            <div className="flex flex-col gap-2.5">
              <PayOption
                active={payType === "deposit"}
                onClick={() => setPayType("deposit")}
                title={`Pay ${depositPercent}% deposit`}
                subtitle={`${money(deposit)} today · ${money(balance)} due on delivery`}
              />
              <PayOption
                active={payType === "full"}
                onClick={() => setPayType("full")}
                title="Pay in full"
                subtitle={`${money(bd.total)} today · nothing due later`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl bg-brand-tint p-4 text-[13px] font-semibold text-brand-deep">
            <span className="flex items-center gap-2">
              <Truck size={16} weight="fill" />{" "}
              {deliveryFeeCents > 0 ? "Delivery, setup & pickup" : "Free delivery, setup & pickup"}
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
              <>Pay {money(amountNow)} now</>
            )}
          </button>
          <p className="mt-2 text-center text-xs font-medium text-ink-mute">
            {payType === "deposit"
              ? `Balance of ${money(balance)} collected on delivery.`
              : "Paid in full — nothing due later."}{" "}
            No charge until you confirm.
          </p>
        </div>
      </div>
    </div>
  );
}

function PayOption({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
        active ? "border-brand bg-brand-tint/40" : "border-sand-line bg-white hover:border-sand"
      }`}
    >
      <span
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
          active ? "border-brand" : "border-sand"
        }`}
      >
        {active ? <span className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="block text-[13px] font-medium text-ink-mute">{subtitle}</span>
      </span>
    </button>
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

function DateRange({
  date,
  endDate,
  changeStart,
  setEndDate,
}: {
  date: string;
  endDate: string;
  changeStart: (v: string) => void;
  setEndDate: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-sand bg-white px-3 py-2">
      <CalendarBlank size={18} weight="fill" className="text-brand" />
      <input
        type="date"
        aria-label="Start date"
        value={date}
        min={new Date().toISOString().slice(0, 10)}
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
  );
}

function InventoryGrid({
  items,
  loading,
  cart,
  setQty,
}: {
  items: ApiItem[];
  loading: boolean;
  cart: Record<string, number>;
  setQty: (id: string, q: number) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-sand/50" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} qty={cart[item.id] ?? 0} onQty={(q) => setQty(item.id, q)} />
      ))}
    </div>
  );
}

/** Centered placeholder for views without content yet (Saved, Inspiration). */
function EmptyState({ icon: Icon, title, body }: { icon: Icon; title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-tint text-brand">
        <Icon size={30} weight="fill" />
      </span>
      <h2 className="font-display text-2xl font-bold text-ink">{title}</h2>
      <p className="mt-2 max-w-sm text-sm font-medium text-ink-soft">{body}</p>
    </div>
  );
}

function CartBar({
  subtotal,
  cartCount,
  range,
  onReview,
}: {
  subtotal: number;
  cartCount: number;
  range: string;
  onReview: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-sand bg-white/95 px-5 py-3.5 backdrop-blur lg:px-8">
      <div className="text-sm font-semibold text-ink-soft">
        <span className="font-display text-lg font-extrabold text-ink">{money(subtotal)}</span> ·{" "}
        {cartCount} {cartCount === 1 ? "item" : "items"} · {range}
      </div>
      <button
        onClick={onReview}
        className="flex flex-shrink-0 items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-deep"
      >
        Review &amp; book <ArrowRight size={16} weight="bold" />
      </button>
    </div>
  );
}

function ContactCapture({
  operatorName,
  email,
  onEmail,
  onSubmit,
  saved,
  busy,
  error,
}: {
  operatorName: string;
  email: string;
  onEmail: (v: string) => void;
  onSubmit: () => void;
  saved: boolean;
  busy: boolean;
  error: string | null;
}) {
  if (saved) {
    return (
      <div className="max-w-[92%] self-start rounded-2xl border border-teal-line bg-teal-tint/50 p-3.5">
        <span className="flex items-center gap-1.5 text-sm font-bold text-teal-deep">
          <CheckCircle size={16} weight="fill" /> Thanks! {operatorName} will email your quote to {email}.
        </span>
      </div>
    );
  }
  const valid = /.+@.+\..+/.test(email.trim());
  return (
    <div className="max-w-[92%] self-start rounded-2xl border border-brand-ring bg-white p-3.5">
      <div className="text-sm font-bold text-ink">{operatorName} will put this together for you</div>
      <p className="mt-0.5 text-[13px] font-medium text-ink-soft">
        Leave your email and they&apos;ll send your custom quote — usually within a few hours.
      </p>
      <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-sand bg-cream px-2 py-1.5">
        <input
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="you@email.com"
          className="min-w-0 flex-1 bg-transparent px-2 text-sm font-medium text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          onClick={onSubmit}
          disabled={busy || !valid}
          className="flex flex-shrink-0 items-center justify-center rounded-lg bg-brand px-3.5 py-1.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:bg-sand disabled:text-ink-mute"
        >
          {busy ? <CircleNotch size={16} weight="bold" className="animate-spin" /> : "Send"}
        </button>
      </div>
      {error ? <p className="mt-1.5 text-[13px] font-semibold text-coral-deep">{error}</p> : null}
    </div>
  );
}

function ChatBubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`max-w-[85%] ${isUser ? "self-end" : "self-start"}`}>
      <div
        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "rounded-br-md bg-brand font-medium text-white"
            : "rounded-bl-md border border-sand-line bg-cream text-ink"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-mute [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-mute [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-mute" />
    </span>
  );
}

function QuoteThumb({ item }: { item?: ApiItem }) {
  const { open } = useLightbox();
  const images = item?.images ?? [];
  const img = images[0];
  const meta = CAT_META[toCategory(item?.category ?? null)];
  const base = `flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg ${img ? "" : meta.tint}`;
  const inner = img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img} alt="" className="h-full w-full object-cover" />
  ) : (
    <meta.Icon size={20} weight="fill" className={meta.ink} />
  );
  if (images.length === 0) return <span className={base}>{inner}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(images, 0);
      }}
      aria-label={`View photos of ${item?.name ?? "item"}`}
      className={`${base} cursor-zoom-in transition-transform hover:scale-105`}
    >
      {inner}
    </button>
  );
}

function ChatQuoteCard({
  quote,
  date,
  onBook,
  byId,
}: {
  quote: QuoteBreakdown;
  date: string | null;
  onBook: () => void;
  byId: Map<string, ApiItem>;
}) {
  return (
    <div className="max-w-[92%] self-start rounded-2xl border border-brand-ring bg-brand-tint/40 p-3.5">
      {date ? (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-brand-deep">
          <CalendarBlank size={13} weight="fill" /> {prettyDate(date)}
        </div>
      ) : null}
      <div className="rounded-xl bg-white p-3.5">
        {quote.lineItems.map((l) => (
          <div key={l.itemId} className="flex items-center gap-2.5 py-1 text-sm">
            <QuoteThumb item={byId.get(l.itemId)} />
            <span className="min-w-0 flex-1 font-semibold text-ink">
              {l.quantity > 1 ? `${l.quantity}× ` : ""}
              {l.name}
            </span>
            <span className="flex-shrink-0 font-bold text-ink">{money(l.lineTotal)}</span>
          </div>
        ))}
        <div className="mt-2 space-y-1 border-t border-sand-line pt-2.5 text-sm">
          {quote.deliveryFee > 0 || quote.tax > 0 ? (
            <div className="flex items-center justify-between text-ink-mute">
              <span>Subtotal</span>
              <span className="font-semibold text-ink">{money(quote.subtotal)}</span>
            </div>
          ) : null}
          {quote.deliveryFee > 0 ? (
            <div className="flex items-center justify-between text-ink-mute">
              <span>Delivery</span>
              <span className="font-semibold text-ink">{money(quote.deliveryFee)}</span>
            </div>
          ) : null}
          {quote.tax > 0 ? (
            <div className="flex items-center justify-between text-ink-mute">
              <span>Sales tax</span>
              <span className="font-semibold text-ink">{money(quote.tax)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between pt-0.5">
            <span className="font-bold text-ink">Total</span>
            <span className="font-display text-lg font-extrabold text-ink">{money(quote.total)}</span>
          </div>
        </div>
        {quote.suggestedDeposit > 0 ? (
          <div className="mt-1 text-right text-xs font-semibold text-ink-mute">
            Deposit today: {money(quote.suggestedDeposit)}
          </div>
        ) : null}
      </div>
      <button
        onClick={onBook}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
      >
        Add to cart &amp; book <ArrowRight size={15} weight="bold" />
      </button>
    </div>
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
  const { open } = useLightbox();
  const cat = toCategory(item.category);
  const meta = CAT_META[cat];
  const available = item.availability?.available ?? 0;
  const soldOut = item.availability != null && available <= 0;
  const images = item.images ?? [];

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-sand-line bg-white">
      <div
        className={`relative flex h-40 items-center justify-center ${images[0] ? "cursor-zoom-in" : meta.tint}`}
        role={images.length ? "button" : undefined}
        aria-label={images.length ? `View photos of ${item.name}` : undefined}
        onClick={images.length ? () => open(images, 0) : undefined}
      >
        {images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[0]} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <meta.Icon size={56} weight="fill" className={meta.ink} />
        )}
        {images.length > 1 ? (
          <span className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-bold text-white">
            +{images.length - 1}
          </span>
        ) : null}
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
