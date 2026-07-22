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
  timezone: string;
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
  taxPercent: number;
  deliveryFeeCents: number;
  deliveryTaxable: boolean;
  deliveryMode: "flat" | "zones" | "distance";
  deliveryConfig: unknown;
  cancellationPolicy: string | null;
  damagePolicy: string | null;
  notifyNewInquiry: boolean;
  notifyNewBooking: boolean;
  notifyBalancePaid: boolean;
  notifyContractSigned: boolean;
  tagline: string | null;
  about: string | null;
  /** Operator-authored guidance injected into the AI quote assistant's system
   *  prompt (tone, recommendations, house rules). Null = none. */
  assistantInstructions: string | null;
  /** Comp / internal account — always entitled to the top tier, never billed.
   *  Admin-set only; see effectivePlanId. */
  billingExempt: boolean;
  availabilityConfig: unknown;
  /** Contract identity — the operator as counterparty on their rental agreement.
   *  Signer name/email fall back to name/contactEmail when unset. */
  businessAddress: string | null;
  esignSignerName: string | null;
  esignSignerEmail: string | null;
  /** The operator's own SignWell template id; null = use the platform default. */
  signwellTemplateId: string | null;
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
  /** Units held out of service by readiness condition (reduce bookable stock). */
  unitsNeedsCleaning: number;
  unitsDamaged: number;
  unitsInRepair: number;
  /** Gear needed to run this item — the loadout checklist. */
  requiredEquipment: EquipmentItem[];
  /** Price in minor units (cents). */
  basePrice: number;
  priceUnit: PriceUnit;
  footprint: Footprint;
  powerRequired: boolean;
  images: string[];
  active: boolean;
}

/** One piece of gear an item needs to operate. */
export interface EquipmentItem {
  label: string;
  qty: number;
}

/** Coerce raw JSONB into a clean equipment list (drops blanks, floors qty at 1). */
export function normalizeEquipment(raw: unknown): EquipmentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => ({
      label: String((e as EquipmentItem)?.label ?? "").trim(),
      qty: Math.max(1, Math.round(Number((e as EquipmentItem)?.qty ?? 1)) || 1),
    }))
    .filter((e) => e.label);
}

/** Units currently out of service (any non-ready condition). */
export function outOfServiceUnits(i: Pick<Item, "unitsNeedsCleaning" | "unitsDamaged" | "unitsInRepair">): number {
  return i.unitsNeedsCleaning + i.unitsDamaged + i.unitsInRepair;
}

/** Ready-to-book units: owned minus anything out of service (never negative). */
export function bookableUnits(i: Pick<Item, "quantity" | "unitsNeedsCleaning" | "unitsDamaged" | "unitsInRepair">): number {
  return Math.max(0, i.quantity - outOfServiceUnits(i));
}

export interface NewItem {
  operatorId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  quantity: number;
  unitsNeedsCleaning?: number;
  unitsDamaged?: number;
  unitsInRepair?: number;
  requiredEquipment?: EquipmentItem[];
  basePrice: number;
  priceUnit?: PriceUnit;
  footprint?: Partial<Footprint>;
  powerRequired?: boolean;
  images?: string[];
  active?: boolean;
}
