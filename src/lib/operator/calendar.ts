export type ItemCategory = "bounce" | "tent" | "tables";

export interface CalEvent {
  label: string;
  category: ItemCategory;
}

export interface CalDay {
  date: number | null; // null = padding cell
  events: CalEvent[];
  fullyBooked: boolean;
  moreCount: number;
}

export const monthLabel = "July 2026";
export const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Category color legend (also used by the sidebar filter).
export const calFilters = [
  { label: "All items", dot: "bg-brand", active: true },
  { label: "Bounce houses", dot: "bg-brand/50" },
  { label: "Tents", dot: "bg-teal" },
  { label: "Tables & chairs", dot: "bg-amber" },
];

const eventsByDate: Record<number, CalEvent[]> = {
  4: [{ label: "J. League", category: "bounce" }],
  5: [{ label: "Tables ×8", category: "tables" }],
  7: [{ label: "J. League", category: "bounce" }],
  9: [{ label: "20×20 Tent", category: "tent" }],
  11: [
    { label: "Rainbow 13", category: "bounce" },
    { label: "Tables ×6", category: "tables" },
  ],
  12: [
    { label: "J. League", category: "bounce" },
    { label: "Rainbow 15 · Millers", category: "bounce" },
  ],
  13: [{ label: "20×20 Tent", category: "tent" }],
  18: [{ label: "Rainbow 13", category: "bounce" }],
  19: [{ label: "J. League", category: "bounce" }],
  25: [{ label: "Tables ×4", category: "tables" }],
  26: [
    { label: "Rainbow 15", category: "bounce" },
    { label: "20×20 Tent", category: "tent" },
  ],
};
const fullyBooked = new Set([12, 19]);
const moreByDate: Record<number, number> = { 12: 1, 19: 2 };

const LEADING_BLANKS = 2; // July 1, 2026 is a Tuesday
const DAYS_IN_MONTH = 31;

/** Month grid cells, padded to whole weeks. */
export const monthDays: CalDay[] = (() => {
  const cells: CalDay[] = [];
  for (let i = 0; i < LEADING_BLANKS; i++)
    cells.push({ date: null, events: [], fullyBooked: false, moreCount: 0 });
  for (let d = 1; d <= DAYS_IN_MONTH; d++) {
    cells.push({
      date: d,
      events: eventsByDate[d] ?? [],
      fullyBooked: fullyBooked.has(d),
      moreCount: moreByDate[d] ?? 0,
    });
  }
  while (cells.length % 7 !== 0)
    cells.push({ date: null, events: [], fullyBooked: false, moreCount: 0 });
  return cells;
})();

/** The selected-day detail (day 12). */
export const selectedDay = {
  date: 12,
  dateLabel: "Saturday, Jul 12",
  fullyBooked: true,
  summary: "3 bookings out · all inventory reserved",
  booking: {
    customer: "The Millers",
    bookingNo: "Booking #1042",
    item: "Rainbow 15×15 Bounce Castle",
    price: "$190 / day",
    location: "Plymouth, MA",
    deliver: "10:00 AM",
    pickup: "5:00 PM",
  },
  contract: { label: "Contract signed", detail: "Rachel Miller · Jul 3" },
  balance: { label: "Balance due on delivery", detail: "$95 paid · $95 balance" },
  alsoOut: [
    { item: "Justice League", time: "8:30 AM" },
    { item: "Rainbow 13×13", time: "4:30 PM" },
  ],
};
