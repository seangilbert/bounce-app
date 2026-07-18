import { describe, it, expect } from "vitest";
import { isLead } from "./lead";
import type { CustomerStats } from "./repo";

const stats = (over: Partial<CustomerStats> = {}): CustomerStats => ({
  bookingCount: 0,
  totalSpentCents: 0,
  lastActivity: null,
  upcomingCount: 0,
  ...over,
});

describe("isLead", () => {
  it("counts someone who has never booked", () => {
    expect(isLead(stats())).toBe(true);
  });

  it("does not count someone who has booked", () => {
    expect(isLead(stats({ bookingCount: 1, totalSpentCents: 25000 }))).toBe(false);
  });

  it("is derived from bookings, NOT from `source` — so a lead who converts stops being one", () => {
    // `source` is first-touch and never rewritten: a person who saved an item and
    // then booked keeps source='saved' forever. If the badge keyed off source
    // they'd be labelled a Lead for life, which is exactly wrong. Bookings are
    // the only definition that stays true over time.
    expect(isLead(stats({ bookingCount: 2 }))).toBe(false);
  });

  it("counts someone who booked and then had it canceled — a booking that never happened isn't revenue", () => {
    // bookingCount only counts committed bookings (see listCustomers), so a
    // canceled-only customer is back to being a lead. That's the honest read.
    expect(isLead(stats({ bookingCount: 0, totalSpentCents: 0 }))).toBe(true);
  });
});
