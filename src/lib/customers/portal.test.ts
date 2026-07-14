import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type QueuedResponse } from "@/test/supabase-mock";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: adminMock }));

import { listAccountBookings, getAccountBooking, isUpcoming, type PortalBooking } from "./portal";

const ACCOUNT = "acct-1";

function mockDb(responses: QueuedResponse[]) {
  const db = makeSupabaseMock(responses);
  adminMock.mockReturnValue(db);
  return db;
}

const order = (over: Record<string, unknown> = {}) => ({
  amount_total: 7500,
  status: "paid",
  created_at: "2026-07-01T00:00:00Z",
  metadata: { payment_type: "deposit" },
  esign_status: null,
  ...over,
});

const bookingRow = (over: Record<string, unknown> = {}) => ({
  id: "bk-1",
  status: "paid",
  start_date: "2026-08-01",
  end_date: "2026-08-02",
  delivery_address: "1 Main St",
  delivery_window: "9–11am",
  subtotal: 20000,
  total: 25000,
  operators: { name: "Jump Co", slug: "jump-co", phone: "555" },
  booking_items: [{ quantity: 2, item: { name: "Bounce house" } }],
  orders: [],
  ...over,
});

beforeEach(() => adminMock.mockReset());

describe("listAccountBookings — ownership scoping", () => {
  it("filters through the customers join to only this account's bookings", async () => {
    const db = mockDb([{ data: [bookingRow()] }]);

    await listAccountBookings(ACCOUNT);

    // This IS the security control: a booking is visible only if it hangs off a
    // `customers` row owned by this account.
    expect(db.builder.eq).toHaveBeenCalledWith("customers.account_id", ACCOUNT);
  });

  it("takes a single round-trip", async () => {
    // Regression guard: this was 3 sequential queries (customers → bookings →
    // orders), and latency here is round-trip-bound (~120ms each).
    const db = mockDb([{ data: [bookingRow()] }]);
    await listAccountBookings(ACCOUNT);
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("returns nothing for an account that has claimed no customer records", async () => {
    mockDb([{ data: [] }]);
    expect(await listAccountBookings(ACCOUNT)).toEqual([]);
  });
});

describe("getAccountBooking — ownership scoping", () => {
  it("constrains by BOTH the booking id and the owning account", async () => {
    const db = mockDb([{ data: bookingRow() }]);

    await getAccountBooking(ACCOUNT, "bk-1");

    expect(db.builder.eq).toHaveBeenCalledWith("id", "bk-1");
    // Without this, knowing an id would be enough to read anyone's booking.
    expect(db.builder.eq).toHaveBeenCalledWith("customers.account_id", ACCOUNT);
  });

  it("returns null for a booking that exists but belongs to someone else", async () => {
    // The scoped query simply finds nothing — indistinguishable, to the caller,
    // from "no such booking". That's the point: the route 404s either way.
    mockDb([{ data: null }]);
    expect(await getAccountBooking(ACCOUNT, "someone-elses-booking")).toBeNull();
  });
});

describe("money", () => {
  const load = async (rows: QueuedResponse[]) => {
    mockDb(rows);
    return (await listAccountBookings(ACCOUNT))[0] as PortalBooking;
  };

  it("sums paid orders into paidCents and derives the balance", async () => {
    const b = await load([
      { data: [bookingRow({ total: 25000, orders: [order({ amount_total: 7500 })] })] },
    ]);
    expect(b.paidCents).toBe(7500);
    expect(b.balanceCents).toBe(17500);
  });

  it("excludes refunded orders from paid — a refund flips the row, it isn't a negative one", async () => {
    const b = await load([
      {
        data: [
          bookingRow({
            total: 25000,
            orders: [
              order({ amount_total: 7500, status: "paid" }),
              order({ amount_total: 10000, status: "refunded" }),
              order({ amount_total: 5000, status: "pending" }),
            ],
          }),
        ],
      },
    ]);
    // Only the genuinely-paid 7500 counts; refunded and pending do not.
    expect(b.paidCents).toBe(7500);
  });

  it("owes nothing on a quote — an uncommitted booking is not a debt", async () => {
    const b = await load([{ data: [bookingRow({ status: "quoted" })] }]);
    expect(b.balanceCents).toBe(0);
  });

  it("owes nothing on a canceled booking, however much was unpaid", async () => {
    const b = await load([{ data: [bookingRow({ status: "canceled" })] }]);
    expect(b.balanceCents).toBe(0);
  });

  it("never reports a negative balance when an operator overcollects", async () => {
    const b = await load([
      { data: [bookingRow({ total: 10000, orders: [order({ amount_total: 12000 })] })] },
    ]);
    expect(b.balanceCents).toBe(0);
  });

  it("falls back to subtotal when total is null (the column is nullable)", async () => {
    const b = await load([{ data: [bookingRow({ total: null, subtotal: 18000 })] }]);
    expect(b.total).toBe(18000);
  });
});

describe("contract status", () => {
  const load = async (rows: QueuedResponse[]) => {
    mockDb(rows);
    return (await listAccountBookings(ACCOUNT))[0] as PortalBooking;
  };

  it("surfaces the esign status from the booking's orders", async () => {
    const b = await load([
      { data: [bookingRow({ orders: [order({ esign_status: "completed" })] })] },
    ]);
    expect(b.contractStatus).toBe("completed");
  });

  it("takes the LATEST status when orders arrive out of order", async () => {
    // Embedded rows come back unordered, so this must not depend on array order.
    const b = await load([
      {
        data: [
          bookingRow({
            orders: [
              order({ created_at: "2026-07-05T00:00:00Z", esign_status: "completed" }),
              order({ created_at: "2026-07-01T00:00:00Z", esign_status: "sent" }),
            ],
          }),
        ],
      },
    ]);
    expect(b.contractStatus).toBe("completed");
  });

  it("is null when no agreement was ever sent", async () => {
    const b = await load([{ data: [bookingRow({ orders: [order()] })] }]);
    expect(b.contractStatus).toBeNull();
  });
});

describe("isUpcoming", () => {
  const b = (status: string, endDate: string) => ({ status, endDate }) as PortalBooking;

  it("counts a committed booking that hasn't ended", () => {
    expect(isUpcoming(b("confirmed", "2026-08-02"), "2026-08-01")).toBe(true);
  });

  it("counts a booking ending today", () => {
    expect(isUpcoming(b("confirmed", "2026-08-01"), "2026-08-01")).toBe(true);
  });

  it("excludes a booking that has ended", () => {
    expect(isUpcoming(b("completed", "2026-07-30"), "2026-08-01")).toBe(false);
  });

  it("excludes a canceled booking even with a future date", () => {
    expect(isUpcoming(b("canceled", "2026-09-01"), "2026-08-01")).toBe(false);
  });

  it("excludes an unpaid quote even with a future date", () => {
    expect(isUpcoming(b("quoted", "2026-09-01"), "2026-08-01")).toBe(false);
  });
});
