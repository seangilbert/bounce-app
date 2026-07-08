"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MagnifyingGlass, CaretRight, AddressBook } from "@phosphor-icons/react/dist/ssr";
import type { CustomerListItem } from "@/lib/customers/repo";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

function initials(name: string | null, email: string | null): string {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || src.slice(0, 2).toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function CustomersView({ customers }: { customers: CustomerListItem[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((c) =>
      [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(term)),
    );
  }, [q, customers]);

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 lg:px-8 lg:py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink lg:text-3xl">Customers</h1>
          <p className="mt-1 text-sm font-medium text-ink-mute">
            {customers.length} {customers.length === 1 ? "person" : "people"} across your bookings and inquiries.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-sand bg-white px-4 py-3">
        <MagnifyingGlass size={18} weight="bold" className="flex-shrink-0 text-ink-mute" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, or phone…"
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink-faint"
        />
      </div>

      {shown.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <AddressBook size={36} weight="light" className="text-ink-faint" />
          <p className="text-sm font-medium text-ink-mute">
            {customers.length === 0 ? "No customers yet — they'll appear as people book or inquire." : "No matches."}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-sand bg-white">
          {shown.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="flex items-center gap-4 border-t border-sand-line px-4 py-3.5 transition-colors first:border-t-0 hover:bg-cream"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-tint font-display text-sm font-bold text-brand-deep">
                {initials(c.name, c.email)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-ink">{c.name ?? c.email ?? c.phone ?? "Unknown"}</div>
                <div className="truncate text-[13px] font-medium text-ink-mute">
                  {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact"}
                </div>
              </div>
              <div className="hidden flex-shrink-0 text-right sm:block">
                <div className="font-display text-sm font-bold text-ink tabular-nums">{money(c.stats.totalSpentCents)}</div>
                <div className="text-[12px] font-medium text-ink-mute tabular-nums">
                  {c.stats.bookingCount} {c.stats.bookingCount === 1 ? "booking" : "bookings"}
                  {c.stats.upcomingCount > 0 ? ` · ${c.stats.upcomingCount} upcoming` : ""}
                </div>
              </div>
              <div className="hidden w-24 flex-shrink-0 text-right text-[12px] font-medium text-ink-mute md:block">
                {fmtDate(c.stats.lastActivity)}
              </div>
              <CaretRight size={16} weight="bold" className="flex-shrink-0 text-ink-faint" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
