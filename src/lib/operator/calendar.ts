export type ItemCategory = "bounce" | "tent" | "tables";
export type CatFilter = "all" | ItemCategory;

export interface CalEvent {
  label: string;
  category: ItemCategory;
  bookingId: string;
}

export interface SelectedLineItem {
  name: string;
  qty: number;
  price: string;
  category: ItemCategory;
}

export interface SelectedBooking {
  id: string;
  customer: string;
  bookingNo: string;
  lineItems: SelectedLineItem[];
  location: string;
  deliver: string;
  pickup: string;
  contract: { label: string; detail: string };
  balance: { label: string; detail: string };
}

export interface SelectedDayDetail {
  iso: string;
  dateLabel: string;
  fullyBooked: boolean;
  summary: string;
  bookings: SelectedBooking[];
}

/** One grid cell — a real day (padding/adjacent-month days carry `inMonth: false`). */
export interface CalDayData {
  iso: string; // YYYY-MM-DD
  dayNum: number; // 1..31
  weekday: number; // 0 (Sun) .. 6 (Sat)
  inMonth: boolean; // belongs to the displayed month
  events: CalEvent[]; // all events that day (month view caps; week view shows all)
  fullyBooked: boolean;
  detail: SelectedDayDetail;
}

export interface CalendarData {
  year: number;
  month: number; // 1..12
  monthLabel: string;
  todayIso: string;
  days: CalDayData[]; // whole visible grid (full weeks), month + adjacent days
  defaultSelectedIso: string | null;
  category: CatFilter;
}

export const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Sidebar "Filter by item" — each maps to a `?cat=` value. */
export const calFilters: { label: string; cat: CatFilter; dot: string }[] = [
  { label: "All items", cat: "all", dot: "bg-brand" },
  { label: "Bounce houses", cat: "bounce", dot: "bg-brand" },
  { label: "Tents", cat: "tent", dot: "bg-teal" },
  { label: "Tables & chairs", cat: "tables", dot: "bg-amber" },
];

export function isCatFilter(v: string | null | undefined): v is CatFilter {
  return v === "all" || v === "bounce" || v === "tent" || v === "tables";
}
