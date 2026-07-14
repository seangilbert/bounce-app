"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MagnifyingGlass, CaretRight, AddressBook, Heart } from "@phosphor-icons/react/dist/ssr";
import { isLead, type CustomerListItem } from "@/lib/customers/repo";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

/** What a lead did to become one — the operator's cue for how to follow up. */
const SOURCE_LABEL: Record<string, string> = {
  saved: "Saved an item",
  inquiry: "Asked a question",
  booking: "Booked",
};

function initials(name: string | null, email: string | null): string {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || src.slice(0, 2).toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function CustomersView({
  customers,
  initialQuery = "",
  isAdmin,
}: {
  customers: CustomerListItem[];
  initialQuery?: string;
  isAdmin: boolean;
}) {
  const [q, setQ] = useState(initialQuery);
  const [itemFilter, setItemFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  /** all | leads | customers — see the segment control below. */
  const [kind, setKind] = useState<"all" | "leads" | "customers">("all");

  const leadCount = useMemo(() => customers.filter((c) => isLead(c.stats)).length, [customers]);

  // Every item any customer has rented — the options for the item filter.
  const itemOptions = useMemo(
    () => [...new Set(customers.flatMap((c) => c.itemNames))].sort(),
    [customers],
  );

  const filtersActive =
    q.trim() !== "" || itemFilter !== "" || from !== "" || to !== "" || kind !== "all";
  const clearFilters = () => {
    setQ("");
    setItemFilter("");
    setFrom("");
    setTo("");
    setKind("all");
  };

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (kind === "leads" && !isLead(c.stats)) return false;
      if (kind === "customers" && isLead(c.stats)) return false;
      if (
        term &&
        ![c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(term)) &&
        !c.itemNames.some((n) => n.toLowerCase().includes(term))
      )
        return false;
      if (itemFilter && !c.itemNames.includes(itemFilter)) return false;
      if (from || to) {
        // A customer matches if any booking's date range overlaps [from, to].
        const overlaps = c.bookingRanges.some((r) => (!to || r.start <= to) && (!from || r.end >= from));
        if (!overlaps) return false;
      }
      return true;
    });
  }, [q, itemFilter, from, to, kind, customers]);

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
          placeholder="Search by name, email, phone, or item…"
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink-faint"
        />
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-faint">Item rented</span>
          <select
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
            className="rounded-xl border border-sand bg-white px-3 py-2.5 text-sm font-semibold text-ink outline-none"
          >
            <option value="">Any item</option>
            {itemOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-faint">Event from</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-sand bg-white px-3 py-2.5 text-sm font-semibold text-ink outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-faint">Event to</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-sand bg-white px-3 py-2.5 text-sm font-semibold text-ink outline-none"
          />
        </label>
        {filtersActive ? (
          <button
            onClick={clearFilters}
            className="h-[42px] rounded-xl px-3 text-[13px] font-bold text-ink-mute transition-colors hover:text-coral-deep"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Leads are people who've shown interest but never booked — they saved an
          item or asked a question. Worth separating: an operator chasing warm
          leads is doing different work from one looking after past customers. */}
      <div className="mt-3 flex items-center gap-1 rounded-xl bg-sand/50 p-1 text-[13px] font-bold">
        {(
          [
            ["all", `All ${customers.length}`],
            ["leads", `Leads ${leadCount}`],
            ["customers", `Customers ${customers.length - leadCount}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              kind === k ? "bg-white text-ink shadow-sm" : "text-ink-mute hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtersActive ? (
        <p className="mt-2 text-[13px] font-medium text-ink-mute">
          {shown.length} {shown.length === 1 ? "match" : "matches"}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <AddressBook size={36} weight="light" className="text-ink-faint" />
          <p className="text-sm font-medium text-ink-mute">
            {customers.length === 0
              ? "No customers yet — they'll appear as people book, inquire, or save an item."
              : "No matches."}
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
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold text-ink">
                    {c.name ?? c.email ?? c.phone ?? "Unknown"}
                  </span>
                  {isLead(c.stats) ? (
                    <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-tint px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-deep">
                      {c.source === "saved" ? <Heart size={9} weight="fill" /> : null}
                      Lead
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-[13px] font-medium text-ink-mute">
                  {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact"}
                </div>
              </div>
              <div className="hidden flex-shrink-0 text-right sm:block">
                {isLead(c.stats) ? (
                  // A lead has no money and no bookings. Showing "$0 · 0 bookings"
                  // would read like a customer who never spent, which is a
                  // different (and worse-sounding) thing than a fresh lead.
                  <div className="text-[12px] font-medium text-ink-mute">
                    {c.source ? SOURCE_LABEL[c.source] : "No bookings yet"}
                  </div>
                ) : (
                  <>
                    {isAdmin ? (
                      <div className="font-display text-sm font-bold text-ink tabular-nums">
                        {money(c.stats.totalSpentCents)}
                      </div>
                    ) : null}
                    <div className="text-[12px] font-medium text-ink-mute tabular-nums">
                      {c.stats.bookingCount} {c.stats.bookingCount === 1 ? "booking" : "bookings"}
                      {c.stats.upcomingCount > 0 ? ` · ${c.stats.upcomingCount} upcoming` : ""}
                    </div>
                  </>
                )}
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
