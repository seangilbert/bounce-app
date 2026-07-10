export type BookingStatus =
  | "inquiry"
  | "quoted"
  | "pending_payment"
  | "paid"
  | "contracted"
  | "confirmed"
  | "delivered"
  | "completed"
  | "canceled";

/** What the caller selects when creating a booking. */
export interface BookingItemInput {
  itemId: string;
  quantity: number;
}

export interface NewBooking {
  operatorId: string;
  startDate: string; // YYYY-MM-DD (inclusive)
  endDate: string; // YYYY-MM-DD (inclusive; same as startDate for single-day)
  items: BookingItemInput[];
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  deliveryWindow?: string | null;
  deliveryAddress?: string | null;
  deliveryZip?: string | null;
  /** Explicit delivery fee (cents) that overrides the operator's pricing. */
  deliveryFeeOverrideCents?: number | null;
  /** Skip the availability-schedule check (operator-created bookings override). */
  skipAvailabilityCheck?: boolean;
  notes?: string | null;
}

/** A booking line with the item name + price snapshot (minor units). */
export interface BookingLineItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Booking {
  id: string;
  createdAt: string;
  updatedAt: string;
  operatorId: string;
  status: BookingStatus;
  startDate: string;
  endDate: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  deliveryWindow: string | null;
  deliveryAddress: string | null;
  deliveryZip: string | null;
  subtotal: number;
  deliveryFee: number;
  taxAmount: number;
  total: number;
  deposit: number | null;
  currency: string;
  notes: string | null;
  items: BookingLineItem[];
}
