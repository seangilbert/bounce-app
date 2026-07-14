import { createAdminClient } from "@/utils/supabase/admin";

export interface Customer {
  id: string;
  operatorId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  firstSeen: string;
  lastSeen: string;
  /** How this record first came to exist (migration 0048). Null for legacy rows
   *  the backfill couldn't attribute. First-touch — never rewritten. */
  source: CustomerSource | null;
}

export interface CustomerStats {
  bookingCount: number;
  totalSpentCents: number;
  lastActivity: string | null; // ISO date of the most recent booking
  upcomingCount: number;
}

export interface CustomerListItem extends Customer {
  stats: CustomerStats;
  /** Distinct item names this customer has rented (non-canceled bookings). */
  itemNames: string[];
  /** Event date ranges from this customer's non-canceled bookings. */
  bookingRanges: { start: string; end: string }[];
}

interface CustomerRow {
  id: string;
  operator_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  first_seen: string;
  last_seen: string;
  source: CustomerSource | null;
}

const rowToCustomer = (r: CustomerRow): Customer => ({
  id: r.id,
  operatorId: r.operator_id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  notes: r.notes,
  firstSeen: r.first_seen,
  lastSeen: r.last_seen,
  source: r.source ?? null,
});

/**
 * A lead is someone who has shown interest but never committed money — they
 * saved an item, or asked a question, and haven't booked.
 *
 * Derived from the bookings, NOT from `source`: `source` is first-touch and
 * never changes, so someone who saved an item and then booked is still
 * source='saved' but is emphatically no longer a lead. Deriving it from actual
 * bookings is the only definition that stays true over time.
 */
export function isLead(stats: CustomerStats): boolean {
  return stats.bookingCount === 0;
}

const norm = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
const lower = (s: string | null | undefined) => (s?.trim() ? s.trim().toLowerCase() : null);

/** Bookings whose status counts toward spend / "a real booking". */
const COMMITTED = new Set(["paid", "contracted", "confirmed", "delivered", "completed"]);

/** How a customer record first came to exist (migration 0048). First-touch. */
export type CustomerSource = "booking" | "inquiry" | "saved";

/**
 * Resolve a customer for this operator by email (primary) then phone, filling any
 * missing fields and bumping last_seen; inserts a new one if none matches.
 * Returns the customer id (or null when there's nothing to key on).
 * Idempotent — safe to call on every booking/inquiry write.
 *
 * `opts.source` is written ONLY on insert. It's first-touch: someone who saved
 * an item and later booked keeps source='saved', because that's where the
 * relationship actually began. Whether they're a *customer* yet is a different
 * question, answered by their bookings.
 *
 * `opts.accountId` links the record to the renter's platform login. Also
 * insert-only — never re-pointed at a different account, since that would
 * silently hand one person's history to another (same rule as
 * claimCustomerRecords).
 */
export async function upsertCustomer(
  operatorId: string,
  contact: { email?: string | null; phone?: string | null; name?: string | null },
  opts: { source?: CustomerSource; accountId?: string } = {},
): Promise<string | null> {
  const email = lower(contact.email);
  const phone = norm(contact.phone);
  const name = norm(contact.name);
  if (!email && !phone) return null;

  const supabase = createAdminClient();
  let existing: CustomerRow | null = null;
  if (email) {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("operator_id", operatorId)
      .eq("email", email)
      .maybeSingle();
    existing = (data as CustomerRow) ?? null;
  }
  if (!existing && phone) {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("operator_id", operatorId)
      .eq("phone", phone)
      .maybeSingle();
    existing = (data as CustomerRow) ?? null;
  }

  if (existing) {
    const patch: Record<string, unknown> = { last_seen: new Date().toISOString() };
    if (name && !existing.name) patch.name = name;
    if (email && !existing.email) patch.email = email;
    if (phone && !existing.phone) patch.phone = phone;
    // Note what is NOT patched: `source` and `account_id`. Both are first-touch
    // and must never be overwritten on a later interaction — see the doc above.
    await supabase.from("customers").update(patch).eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      operator_id: operatorId,
      name,
      email,
      phone,
      source: opts.source ?? null,
      account_id: opts.accountId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // Lost a race on the unique email — fetch the winner instead of throwing.
    if (email) {
      const { data: won } = await supabase
        .from("customers")
        .select("id")
        .eq("operator_id", operatorId)
        .eq("email", email)
        .maybeSingle();
      if (won) return won.id as string;
    }
    throw new Error(`upsertCustomer failed: ${error.message}`);
  }
  return data.id as string;
}

interface StatBooking {
  customer_id: string | null;
  total: number;
  status: string;
  start_date: string;
}

/** Aggregate an operator's bookings onto each customer by the customer_id FK. */
function aggregate(bookings: StatBooking[], todayIso: string) {
  const stats = new Map<string, CustomerStats>();
  const get = (id: string) =>
    stats.get(id) ?? { bookingCount: 0, totalSpentCents: 0, lastActivity: null, upcomingCount: 0 };
  for (const b of bookings) {
    if (!b.customer_id || b.status === "canceled") continue;
    const s = get(b.customer_id);
    s.bookingCount += 1;
    if (COMMITTED.has(b.status)) s.totalSpentCents += b.total;
    if (b.start_date >= todayIso) s.upcomingCount += 1;
    if (!s.lastActivity || b.start_date > s.lastActivity) s.lastActivity = b.start_date;
    stats.set(b.customer_id, s);
  }
  return stats;
}

/** The operator's customers with derived stats, optionally filtered by a search. */
export async function listCustomers(operatorId: string, search?: string): Promise<CustomerListItem[]> {
  const supabase = createAdminClient();
  let q = supabase.from("customers").select("*").eq("operator_id", operatorId);
  const term = search?.trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, "")}%`;
    q = q.or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listCustomers failed: ${error.message}`);
  const customers = (data as CustomerRow[]).map(rowToCustomer);

  const { data: bookings } = await supabase
    .from("bookings")
    .select("customer_id, total, status, start_date, end_date, booking_items(items(name))")
    .eq("operator_id", operatorId)
    .not("customer_id", "is", null);
  const todayIso = new Date().toISOString().slice(0, 10);
  type ItemRef = { name: string } | { name: string }[] | null;
  const rows = (bookings ?? []) as unknown as (StatBooking & {
    end_date: string;
    booking_items: { items: ItemRef }[] | null;
  })[];
  const stats = aggregate(rows, todayIso);

  // Per-customer search facets: item names rented + event date ranges (skip
  // canceled — those aren't real events the operator would search for).
  const items = new Map<string, Set<string>>();
  const ranges = new Map<string, { start: string; end: string }[]>();
  for (const b of rows) {
    if (!b.customer_id || b.status === "canceled") continue;
    const names = items.get(b.customer_id) ?? new Set<string>();
    for (const li of b.booking_items ?? []) {
      const it = Array.isArray(li.items) ? li.items[0] : li.items;
      if (it?.name) names.add(it.name);
    }
    items.set(b.customer_id, names);
    const rs = ranges.get(b.customer_id) ?? [];
    rs.push({ start: b.start_date, end: b.end_date });
    ranges.set(b.customer_id, rs);
  }

  return customers
    .map((c) => ({
      ...c,
      stats: stats.get(c.id) ?? { bookingCount: 0, totalSpentCents: 0, lastActivity: null, upcomingCount: 0 },
      itemNames: [...(items.get(c.id) ?? [])].sort(),
      bookingRanges: ranges.get(c.id) ?? [],
    }))
    .sort((a, b) => (b.stats.lastActivity ?? b.lastSeen).localeCompare(a.stats.lastActivity ?? a.lastSeen));
}

export async function getCustomer(operatorId: string, id: string): Promise<Customer | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("operator_id", operatorId)
    .maybeSingle();
  if (error) throw new Error(`getCustomer failed: ${error.message}`);
  return data ? rowToCustomer(data as CustomerRow) : null;
}

export interface CustomerPayment {
  /** deposit | balance | full | payment (from the order's payment_type). */
  type: string;
  amountCents: number;
  /** paid | refunded | pending | failed. */
  status: string;
  date: string;
  /** "cash" for manually-recorded payments; undefined for card. */
  method?: string;
}
export interface CustomerBooking {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  total: number;
  items: string;
  /** Real payment transactions for this booking (from `orders`). */
  payments: CustomerPayment[];
  /** Net card collected for this booking (paid orders; refunds excluded). */
  collectedCents: number;
}
export interface CustomerInquiry {
  id: string;
  createdAt: string;
  status: string;
  channel: string;
  preview: string;
}

/** A customer's bookings + inquiries, matched by email/phone (most recent first). */
export async function getCustomerActivity(
  operatorId: string,
  customer: Customer,
): Promise<{ bookings: CustomerBooking[]; inquiries: CustomerInquiry[] }> {
  const supabase = createAdminClient();
  const [{ data: bRows }, { data: iRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, start_date, end_date, status, total, booking_items(quantity, item:items(name))")
      .eq("operator_id", operatorId)
      .eq("customer_id", customer.id)
      .order("start_date", { ascending: false }),
    supabase
      .from("inquiries")
      .select("id, created_at, status, channel, inbound_message")
      .eq("operator_id", operatorId)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false }),
  ]);

  // Pull the real payment transactions (orders) for these bookings.
  const bookingIds = (bRows ?? []).map((b: Record<string, unknown>) => b.id as string);
  const paymentsByBooking = new Map<string, CustomerPayment[]>();
  if (bookingIds.length) {
    const { data: orders } = await supabase
      .from("orders")
      .select("booking_id, amount_total, status, created_at, metadata")
      .in("booking_id", bookingIds)
      .order("created_at", { ascending: true });
    for (const o of (orders ?? []) as Record<string, unknown>[]) {
      const bid = o.booking_id as string;
      const meta = (o.metadata as { payment_type?: string; method?: string } | null) ?? {};
      const arr = paymentsByBooking.get(bid) ?? [];
      arr.push({
        type: meta.payment_type ?? "payment",
        amountCents: o.amount_total as number,
        status: o.status as string,
        date: o.created_at as string,
        method: meta.method,
      });
      paymentsByBooking.set(bid, arr);
    }
  }

  const bookings: CustomerBooking[] = (bRows ?? []).map((b: Record<string, unknown>) => {
    const id = b.id as string;
    const payments = paymentsByBooking.get(id) ?? [];
    return {
      id,
      startDate: b.start_date as string,
      endDate: b.end_date as string,
      status: b.status as string,
      total: b.total as number,
      items: ((b.booking_items as { quantity: number; item: { name: string } | null }[]) ?? [])
        .map((li) => `${li.quantity > 1 ? `${li.quantity}× ` : ""}${li.item?.name ?? "item"}`)
        .join(", "),
      payments,
      collectedCents: payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountCents, 0),
    };
  });
  const inquiries: CustomerInquiry[] = (iRows ?? []).map((i: Record<string, unknown>) => ({
    id: i.id as string,
    createdAt: i.created_at as string,
    status: i.status as string,
    channel: i.channel as string,
    preview: ((i.inbound_message as string) ?? "").slice(0, 120),
  }));
  return { bookings, inquiries };
}

export async function updateCustomerNotes(operatorId: string, id: string, notes: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ notes: notes.trim() || null })
    .eq("id", id)
    .eq("operator_id", operatorId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`updateCustomerNotes failed: ${error.message}`);
  return !!data;
}
