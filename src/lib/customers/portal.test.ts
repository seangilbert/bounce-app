import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type QueuedResponse } from "@/test/supabase-mock";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: adminMock }));

import { listAccountBookings, getAccountBooking, isUpcoming, type PortalBooking } from "./portal";

const ACCOUNT = "acct-1";

/** Queue the responses for one portal read, in the order the code makes them. */
function mockDb(responses: QueuedResponse[]) {
  const db = makeSupabaseMock(responses);
  adminMock.mockReturnValue(db);
  return db;
}

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
  ...over,
});

const order = (over: Record<string, unknown> = {}) => ({
  booking_id: "bk-1",
  amount_total: 7500,
  status: "paid",
  created_at: "2026-07-01T00:00:00Z",
  metadata: { payment_type: "deposit" },
  esign_status: null,
  ...over,
});

beforeEach(() => adminMock.mockReset());

describe("listAccountBookings — ownership scoping", () => {
  it("returns nothing for an account that has claimed no customer records", async () => {
    // The account owns zero `customers` rows, so there is nothing to fan out to.
    const db = mockDb([{ data: [] }]);
    expect(await listAccountBookings(ACCOUNT)).toEqual([]);
    // Critically: it must NOT go on to query bookings with an empty filter,
    // which in Postgres `in ()` terms could otherwise mean "no filter at all".
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.from).toHaveBeenCalledWith("customers");
  });

  it("filters bookings to the customer ids this account owns", async () => {
    const db = mockDb([
      { data: [{ id: "cust-a" }, { id: "cust-b" }] }, // owned customer rows
      { data: [bookingRow()] }, // bookings
      { data: [order()] }, // orders
    ]);
    await listAccountBookings(ACCOUNT);
    expect(db.from).toHaveBeenCalledWith("bookings");
    expect(db.builder.in).toHaveBeenCalledWith("customer_id", ["cust-a", "cust-b"]);
  });
});

describe("getAccountBooking — ownership scoping", () => {
  it("returns null when the account owns no customer records", async () => {
    mockDb([{ data: [] }]);
    expect(await getAccountBooking(ACCOUNT, "bk-1")).toBeNull();
  });

  it("constrains the lookup by customer_id as well as booking id", async () => {
    // This is the check that stops a valid session reading ANY booking by id.
    const db = mockDb([{ data: [{ id: "cust-a" }] }, { data: bookingRow() }, { data: [] }]);
    await getAccountBooking(ACCOUNT, "bk-1");
    expect(db.builder.eq).toHaveBeenCalledWith("id", "bk-1");
    expect(db.builder.in).toHaveBeenCalledWith("customer_id", ["cust-a"]);
  });

  it("returns null for a booking that exists but belongs to someone else", async () => {
    // The scoped query simply finds nothing — the caller can't tell this apart
    // from "no such booking", which is the point.
    mockDb([{ data: [{ id: "cust-a" }] }, { data: null }]);
    expect(await getAccountBooking(ACCOUNT, "someone-elses-booking")).toBeNull();
  });
});

describe("money", () => {
  const load = async (rows: QueuedResponse[]) => {
    mockDb(rows);
    return (await listAccountBookings(ACCOUNT))[0] as PortalBooking;
  };
  const owned: QueuedResponse = { data: [{ id: "cust-a" }] };

  it("sums paid orders into paidCents and derives the balance", async () => {
    const b = await load([
      owned,
      { data: [bookingRow({ total: 25000 })] },
      { data: [order({ amount_total: 7500 })] },
    ]);
    expect(b.paidCents).toBe(7500);
    expect(b.balanceCents).toBe(17500);
  });

  it("excludes refunded orders from paid — a refund flips the row, it isn't a negative one", async () => {
    const b = await load([
      owned,
      { data: [bookingRow({ total: 25000 })] },
      {
        data: [
          order({ amount_total: 7500, status: "paid" }),
          order({ amount_total: 10000, status: "refunded" }),
          order({ amount_total: 5000, status: "pending" }),
        ],
      },
    ]);
    // Only the genuinely-paid 7500 counts; refunded and pending do not.
    expect(b.paidCents).toBe(7500);
  });

  it("owes nothing on a quote — an uncommitted booking is not a debt", async () => {
    const b = await load([owned, { data: [bookingRow({ status: "quoted" })] }, { data: [] }]);
    expect(b.balanceCents).toBe(0);
  });

  it("owes nothing on a canceled booking, however much was unpaid", async () => {
    const b = await load([owned, { data: [bookingRow({ status: "canceled" })] }, { data: [] }]);
    expect(b.balanceCents).toBe(0);
  });

  it("never reports a negative balance when an operator overcollects", async () => {
    const b = await load([
      owned,
      { data: [bookingRow({ total: 10000 })] },
      { data: [order({ amount_total: 12000 })] },
    ]);
    expect(b.balanceCents).toBe(0);
  });

  it("falls back to subtotal when total is null (the column is nullable)", async () => {
    const b = await load([
      owned,
      { data: [bookingRow({ total: null, subtotal: 18000 })] },
      { data: [] },
    ]);
    expect(b.total).toBe(18000);
  });
});

describe("contract status", () => {
  it("surfaces the esign status from the booking's orders", async () => {
    mockDb([
      { data: [{ id: "cust-a" }] },
      { data: [bookingRow()] },
      { data: [order({ esign_status: "completed" })] },
    ]);
    const [b] = await listAccountBookings(ACCOUNT);
    expect(b.contractStatus).toBe("completed");
  });

  it("is null when no agreement was ever sent", async () => {
    mockDb([{ data: [{ id: "cust-a" }] }, { data: [bookingRow()] }, { data: [order()] }]);
    const [b] = await listAccountBookings(ACCOUNT);
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
