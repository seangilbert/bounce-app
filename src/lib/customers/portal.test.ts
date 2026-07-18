import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type QueuedResponse } from "@/test/supabase-mock";

// Ownership is now enforced by the DATABASE (RLS Phase 1, migration 0049) — a
// renter's user-scoped query returns only their own bookings, verified against
// the live DB (a foreign booking id returns 0 rows, anon returns 0). These unit
// tests therefore cover the LOGIC on top of already-scoped rows: the public
// operator/item merge, money math, contract status, and upcoming.
const { serverMock, adminMock } = vi.hoisted(() => ({ serverMock: vi.fn(), adminMock: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: serverMock }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: adminMock }));

import { listAccountBookings, getAccountBooking, isUpcoming, type PortalBooking } from "./portal";

/** server = the RLS'd bookings query; admin = the operators + items ref lookups. */
function mock(bookings: QueuedResponse, operators: QueuedResponse, items: QueuedResponse) {
  serverMock.mockReturnValue(makeSupabaseMock([bookings]));
  adminMock.mockReturnValue(makeSupabaseMock([operators, items]));
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
  operator_id: "op-1",
  booking_items: [{ quantity: 2, item_id: "item-1" }],
  orders: [],
  ...over,
});

const OPS: QueuedResponse = { data: [{ id: "op-1", name: "Jump Co", slug: "jump-co", phone: "555" }] };
const ITEMS: QueuedResponse = { data: [{ id: "item-1", name: "Bounce house" }] };

beforeEach(() => {
  serverMock.mockReset();
  adminMock.mockReset();
});

describe("listAccountBookings — uses the user-scoped client (RLS-enforced)", () => {
  it("queries bookings via the SERVER client, not the admin one", async () => {
    mock({ data: [bookingRow()] }, OPS, ITEMS);
    await listAccountBookings();
    // The whole point of Phase 1: the owned read must carry the renter's JWT.
    expect(serverMock).toHaveBeenCalled();
  });

  it("returns [] and skips ref lookups for a renter who owns nothing", async () => {
    mock({ data: [] }, OPS, ITEMS);
    expect(await listAccountBookings()).toEqual([]);
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("merges public operator identity + item names from the service-role lookup", async () => {
    mock({ data: [bookingRow()] }, OPS, ITEMS);
    const [b] = await listAccountBookings();
    expect(b.operatorName).toBe("Jump Co");
    expect(b.operatorSlug).toBe("jump-co");
    expect(b.items).toEqual([{ name: "Bounce house", quantity: 2 }]);
  });

  it("falls back gracefully when ref data is missing", async () => {
    mock({ data: [bookingRow()] }, { data: [] }, { data: [] });
    const [b] = await listAccountBookings();
    expect(b.operatorName).toBe("Operator");
    expect(b.items).toEqual([{ name: "Item", quantity: 2 }]);
  });
});

describe("getAccountBooking", () => {
  it("returns null (→ 404) when RLS yields nothing — indistinguishable from not-yours", async () => {
    serverMock.mockReturnValue(makeSupabaseMock([{ data: null }]));
    expect(await getAccountBooking("someone-elses-booking")).toBeNull();
  });

  it("returns the merged booking when RLS lets it through", async () => {
    mock({ data: bookingRow() }, OPS, ITEMS);
    const b = await getAccountBooking("bk-1");
    expect(b?.operatorName).toBe("Jump Co");
  });
});

describe("money", () => {
  const load = async (bookings: QueuedResponse) => {
    mock(bookings, OPS, ITEMS);
    return (await listAccountBookings())[0] as PortalBooking;
  };

  it("sums paid orders into paidCents and derives the balance", async () => {
    const b = await load({ data: [bookingRow({ total: 25000, orders: [order({ amount_total: 7500 })] })] });
    expect(b.paidCents).toBe(7500);
    expect(b.balanceCents).toBe(17500);
  });

  it("excludes refunded orders from paid — a refund flips the row, it isn't a negative one", async () => {
    const b = await load({
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
    });
    expect(b.paidCents).toBe(7500);
  });

  it("owes nothing on a quote or a canceled booking", async () => {
    expect((await load({ data: [bookingRow({ status: "quoted" })] })).balanceCents).toBe(0);
    expect((await load({ data: [bookingRow({ status: "canceled" })] })).balanceCents).toBe(0);
  });

  it("never reports a negative balance when an operator overcollects", async () => {
    const b = await load({ data: [bookingRow({ total: 10000, orders: [order({ amount_total: 12000 })] })] });
    expect(b.balanceCents).toBe(0);
  });

  it("falls back to subtotal when total is null (the column is nullable)", async () => {
    const b = await load({ data: [bookingRow({ total: null, subtotal: 18000 })] });
    expect(b.total).toBe(18000);
  });
});

describe("contract status", () => {
  const load = async (bookings: QueuedResponse) => {
    mock(bookings, OPS, ITEMS);
    return (await listAccountBookings())[0] as PortalBooking;
  };

  it("surfaces the LATEST esign status from the booking's orders (unordered-safe)", async () => {
    const b = await load({
      data: [
        bookingRow({
          orders: [
            order({ created_at: "2026-07-05T00:00:00Z", esign_status: "completed" }),
            order({ created_at: "2026-07-01T00:00:00Z", esign_status: "sent" }),
          ],
        }),
      ],
    });
    expect(b.contractStatus).toBe("completed");
  });

  it("is null when no agreement was ever sent", async () => {
    const b = await load({ data: [bookingRow({ orders: [order()] })] });
    expect(b.contractStatus).toBeNull();
  });
});

describe("isUpcoming", () => {
  const b = (status: string, endDate: string) => ({ status, endDate }) as PortalBooking;
  it("counts a committed booking that hasn't ended (incl. ending today)", () => {
    expect(isUpcoming(b("confirmed", "2026-08-02"), "2026-08-01")).toBe(true);
    expect(isUpcoming(b("confirmed", "2026-08-01"), "2026-08-01")).toBe(true);
  });
  it("excludes ended, canceled, and uncommitted bookings", () => {
    expect(isUpcoming(b("completed", "2026-07-30"), "2026-08-01")).toBe(false);
    expect(isUpcoming(b("canceled", "2026-09-01"), "2026-08-01")).toBe(false);
    expect(isUpcoming(b("quoted", "2026-09-01"), "2026-08-01")).toBe(false);
  });
});
