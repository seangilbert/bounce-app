"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CaretLeft,
  EnvelopeSimple,
  Phone,
  Plus,
  FloppyDisk,
  CircleNotch,
  CalendarBlank,
  ChatCircleDots,
} from "@phosphor-icons/react/dist/ssr";
import type { Customer, CustomerBooking, CustomerInquiry } from "@/lib/customers/repo";
import { BookingBuilder } from "@/components/operator/bookings/BookingBuilder";
import { updateCustomerNotesAction } from "@/app/(operator)/customers/actions";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
const COMMITTED = new Set(["paid", "contracted", "confirmed", "delivered", "completed"]);

function fmtRange(start: string, end: string): string {
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return start === end ? f(start) : `${f(start)} → ${f(end)}`;
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function initials(name: string | null, email: string | null): string {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || src.slice(0, 2).toUpperCase();
}

const PAY_TONE: Record<string, string> = {
  paid: "text-teal",
  refunded: "text-coral-deep",
  pending: "text-amber-deep",
  failed: "text-coral-deep",
};

const STATUS_TONE: Record<string, string> = {
  paid: "text-teal", contracted: "text-teal", confirmed: "text-teal", delivered: "text-teal", completed: "text-ink-mute",
  canceled: "text-coral-deep", quoted: "text-amber-deep", pending_payment: "text-amber-deep", inquiry: "text-ink-mute",
};

export function CustomerProfile({
  operatorId,
  customer,
  activity,
}: {
  operatorId: string;
  customer: Customer;
  activity: { bookings: CustomerBooking[]; inquiries: CustomerInquiry[] };
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savedNotes, setSavedNotes] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  const { bookings, inquiries } = activity;
  const active = bookings.filter((b) => b.status !== "canceled");
  const totalBooked = bookings.filter((b) => COMMITTED.has(b.status)).reduce((s, b) => s + b.total, 0);
  const collected = bookings.reduce((s, b) => s + b.collectedCents, 0);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = active.filter((b) => b.startDate >= today).length;

  async function saveNotes() {
    setSavingNotes(true);
    setSavedNotes(false);
    const res = await updateCustomerNotesAction(customer.id, notes);
    setSavingNotes(false);
    if (res.ok) {
      setSavedNotes(true);
      setTimeout(() => setSavedNotes(false), 2500);
    }
  }

  const notesDirty = notes.trim() !== (customer.notes ?? "").trim();

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:py-8">
      <Link href="/customers" className="mb-5 inline-flex items-center gap-1.5 text-sm font-bold text-ink-mute transition-colors hover:text-ink">
        <CaretLeft size={15} weight="bold" /> Customers
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-brand-tint font-display text-lg font-bold text-brand-deep">
            {initials(customer.name, customer.email)}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-ink">{customer.name ?? customer.email ?? customer.phone ?? "Unknown"}</h1>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13.5px] font-medium text-ink-mute">
              {customer.email ? <span>{customer.email}</span> : null}
              {customer.phone ? <span>{customer.phone}</span> : null}
              <span className="text-ink-faint">Customer since {fmtDateTime(customer.firstSeen)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          {customer.email ? (
            <a href={`mailto:${customer.email}`} className="flex h-10 w-10 items-center justify-center rounded-xl border border-sand bg-white text-brand transition-colors hover:bg-brand-tint" title="Email">
              <EnvelopeSimple size={18} weight="fill" />
            </a>
          ) : null}
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="flex h-10 w-10 items-center justify-center rounded-xl border border-sand bg-white text-brand transition-colors hover:bg-brand-tint" title="Call">
              <Phone size={18} weight="fill" />
            </a>
          ) : null}
          <button onClick={() => setBuilderOpen(true)} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep">
            <Plus size={16} weight="bold" /> Book again
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Collected", value: money(collected) },
          { label: "Total booked", value: money(totalBooked) },
          { label: "Bookings", value: String(active.length) },
          { label: "Upcoming", value: String(upcoming) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-sand bg-white px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-faint">{s.label}</div>
            <div className="mt-1 font-display text-lg font-bold text-ink tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="mt-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">Private notes</div>
        <div className="mt-2 rounded-2xl border border-sand bg-white p-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything to remember about this customer (only you see this)…"
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
          />
          <div className="mt-1 flex items-center justify-end gap-3">
            {savedNotes ? <span className="text-[13px] font-semibold text-teal">Saved</span> : null}
            <button
              onClick={saveNotes}
              disabled={!notesDirty || savingNotes}
              className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-[13px] font-bold text-cream transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              {savingNotes ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <FloppyDisk size={14} weight="fill" />}
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Bookings */}
      <div className="mt-7">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
          <CalendarBlank size={13} weight="fill" /> Bookings ({bookings.length})
        </div>
        {bookings.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-ink-mute">No bookings yet.</p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-2xl border border-sand bg-white">
            {bookings.map((b) => {
              const balanceDue = b.total - b.collectedCents;
              const showBalance = b.collectedCents > 0 && balanceDue > 0 && b.status !== "canceled";
              return (
                <Link key={b.id} href={`/bookings/${b.id}`} className="block border-t border-sand-line px-4 py-3 transition-colors first:border-t-0 hover:bg-cream">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-ink">{b.items || "Booking"}</div>
                      <div className="text-[12.5px] font-medium text-ink-mute">{fmtRange(b.startDate, b.endDate)}</div>
                    </div>
                    <span className={`flex-shrink-0 text-[12px] font-bold capitalize ${STATUS_TONE[b.status] ?? "text-ink-mute"}`}>{b.status.replace(/_/g, " ")}</span>
                    <span className="w-16 flex-shrink-0 text-right font-display text-sm font-bold text-ink tabular-nums">{money(b.total)}</span>
                  </div>
                  {b.payments.length > 0 || showBalance ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-sand-line pt-2 text-[12px] font-medium">
                      {b.payments.map((p, i) => (
                        <span key={i} className="text-ink-mute">
                          <span className="capitalize text-ink-soft">{p.type}</span>{" "}
                          {p.status === "refunded" ? "−" : ""}
                          {money(p.amountCents)} ·{" "}
                          <span className={PAY_TONE[p.status] ?? "text-ink-mute"}>{p.status}</span>
                          <span className="text-ink-faint"> · {fmtDateTime(p.date)}</span>
                        </span>
                      ))}
                      {showBalance ? <span className="font-bold text-amber-deep">Balance due {money(balanceDue)}</span> : null}
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Inquiries */}
      {inquiries.length > 0 ? (
        <div className="mt-7">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
            <ChatCircleDots size={13} weight="fill" /> Conversations ({inquiries.length})
          </div>
          <div className="mt-2 overflow-hidden rounded-2xl border border-sand bg-white">
            {inquiries.map((i) => (
              <Link key={i.id} href="/inquiries" className="flex items-center gap-3 border-t border-sand-line px-4 py-3 transition-colors first:border-t-0 hover:bg-cream">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{i.preview || "Inquiry"}</div>
                  <div className="text-[12.5px] font-medium text-ink-mute">{fmtDateTime(i.createdAt)} · via {i.channel}</div>
                </div>
                <span className="flex-shrink-0 text-[12px] font-bold capitalize text-ink-mute">{i.status.replace(/_/g, " ")}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {builderOpen ? (
        <BookingBuilder
          operatorId={operatorId}
          initial={{
            customerName: customer.name ?? undefined,
            customerEmail: customer.email ?? undefined,
            customerPhone: customer.phone ?? undefined,
          }}
          onClose={() => setBuilderOpen(false)}
        />
      ) : null}
    </div>
  );
}
