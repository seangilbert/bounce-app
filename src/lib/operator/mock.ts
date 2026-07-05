/**
 * Static mock data for the operator app UI. Mirrors the shapes we'll later get
 * from the real backend (bookings, inquiries, availability), so wiring is a
 * swap-out, not a rewrite. Data only — no rendering.
 */

export const operator = { firstName: "Cheri", initials: "CB", business: "Bounce USA" };

export const today = { dateLabel: "Saturday, July 12" };

export const weekStats = { revenue: "$2,340", bookings: 9, repliedPct: 100 };

export const aiSummary = {
  since: "6 AM",
  quotesSent: 3,
  avgReplyMin: 2,
  booked: 2,
  needsYou: 1,
};

/** The one inquiry the assistant escalated for operator review. */
export const flaggedInquiry = {
  customer: "New customer",
  location: "Plymouth",
  message:
    "Is the princess bounce house available for Sat the 12th, backyard in Plymouth, ~20 kids?",
  aiNote:
    "Princess castle isn't in your inventory. Want me to offer the Rainbow 15×15 instead?",
};

export const weatherAdvisory = {
  headline: "Rain likely 2–4 PM",
  detail:
    "Could affect the Miller 10 AM setup. A heads-up message is drafted and ready.",
  short: "Rain 2–4 PM may affect the Miller setup — draft ready",
};

export type StopType = "DELIVER" | "PICK UP";

export interface Stop {
  time: string;
  meridiem: string;
  type: StopType;
  item: string;
  customer: string;
  address: string;
}

export const todayStops: Stop[] = [
  {
    time: "8:30",
    meridiem: "AM",
    type: "DELIVER",
    item: "Justice League Bounce House",
    customer: "Sarah Chen",
    address: "14 Oak St, Plymouth",
  },
  {
    time: "10:00",
    meridiem: "AM",
    type: "DELIVER",
    item: "Rainbow 15×15 Bounce Castle",
    customer: "The Millers",
    address: "8 Harbor Rd, Plymouth",
  },
  {
    time: "4:30",
    meridiem: "PM",
    type: "PICK UP",
    item: "Rainbow 13×13 Bounce Castle",
    customer: "Diaz Party",
    address: "22 Elm Ave, Kingston",
  },
];
