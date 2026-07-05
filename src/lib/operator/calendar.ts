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

export interface SelectedBooking {
  customer: string;
  bookingNo: string;
  item: string;
  price: string;
  location: string;
  deliver: string;
  pickup: string;
}

export interface SelectedDayDetail {
  date: number;
  dateLabel: string;
  fullyBooked: boolean;
  summary: string;
  booking: SelectedBooking | null;
  contract: { label: string; detail: string } | null;
  balance: { label: string; detail: string } | null;
  alsoOut: { item: string; time: string }[];
}

export interface CalendarMonth {
  monthLabel: string;
  monthDays: CalDay[];
  selected: SelectedDayDetail | null;
}

export const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Category color legend (also used by the sidebar filter).
export const calFilters = [
  { label: "All items", dot: "bg-brand", active: true },
  { label: "Bounce houses", dot: "bg-brand/50" },
  { label: "Tents", dot: "bg-teal" },
  { label: "Tables & chairs", dot: "bg-amber" },
];
