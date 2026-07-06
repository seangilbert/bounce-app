export type PriceUnit = "per_day" | "per_hour" | "flat";

export interface Operator {
  id: string;
  name: string;
  slug: string | null;
  ownerName: string | null;
  location: string | null;
  plan: string;
  latitude: number | null;
  longitude: number | null;
  contactEmail: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  stripeConnectId: string | null;
  connectChargesEnabled: boolean;
  phone: string | null;
  depositPercent: number;
  autoQuoteCapCents: number;
  minLeadHours: number;
}

/** Physical footprint in feet, used later for space/access checks. */
export interface Footprint {
  w: number | null;
  l: number | null;
  h: number | null;
}

/** A rentable catalog item (an inflatable, machine, add-on, etc.). */
export interface Item {
  id: string;
  createdAt: string;
  updatedAt: string;
  operatorId: string;
  name: string;
  description: string | null;
  category: string | null;
  /** Units the operator owns — the ceiling for concurrent bookings. */
  quantity: number;
  /** Price in minor units (cents). */
  basePrice: number;
  priceUnit: PriceUnit;
  footprint: Footprint;
  powerRequired: boolean;
  images: string[];
  active: boolean;
}

export interface NewItem {
  operatorId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  quantity: number;
  basePrice: number;
  priceUnit?: PriceUnit;
  footprint?: Partial<Footprint>;
  powerRequired?: boolean;
  images?: string[];
  active?: boolean;
}
