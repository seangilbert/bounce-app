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
}

export interface CustomerStats {
  bookingCount: number;
  totalSpentCents: number;
  lastActivity: string | null; // ISO date of the most recent booking
  upcomingCount: number;
}

export interface CustomerListItem extends Customer {
  stats: CustomerStats;
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
});

const norm = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
const lower = (s: string | null | undefined) => (s?.trim() ? s.trim().toLowerCase() : null);

/** Bookings whose status counts toward spend / "a real booking". */
const COMMITTED = new Set(["paid", "contracted", "confirmed", "delivered", "completed"]);

/**
 * Resolve a customer for this operator by email (primary) then phone, filling any
 * missing fields and bumping last_seen; inserts a new one if none matches.
 * Returns the customer id (or null when there's nothing to key on).
 * Idempotent — safe to call on every booking/inquiry write.
 */
export async function upsertCustomer(
  operatorId: string,
  contact: { email?: string | null; phone?: string | null; name?: string | null },
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
    await supabase.from("customers").update(patch).eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({ operator_id: operatorId, name, email, phone })
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
    .select("customer_id, total, status, start_date")
    .eq("operator_id", operatorId)
    .not("customer_id", "is", null);
  const todayIso = new Date().toISOString().slice(0, 10);
  const stats = aggregate((bookings as StatBooking[]) ?? [], todayIso);

  return customers
    .map((c) => ({
      ...c,
      stats: stats.get(c.id) ?? { bookingCount: 0, totalSpentCents: 0, lastActivity: null, upcomingCount: 0 },
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

export interface CustomerBooking {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  total: number;
  items: string;
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

  const bookings: CustomerBooking[] = (bRows ?? []).map((b: Record<string, unknown>) => ({
    id: b.id as string,
    startDate: b.start_date as string,
    endDate: b.end_date as string,
    status: b.status as string,
    total: b.total as number,
    items: ((b.booking_items as { quantity: number; item: { name: string } | null }[]) ?? [])
      .map((li) => `${li.quantity > 1 ? `${li.quantity}× ` : ""}${li.item?.name ?? "item"}`)
      .join(", "),
  }));
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
