import {
  MapPin,
  Package,
  CreditCard,
  Files,
  Robot,
  Scroll,
  Palette,
  ChatCircleDots,
  Rocket,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { SetupStepKey } from "@/lib/operator/setup";

/** Copy + destination for each checklist step. Shared by the dashboard card and
 *  the full guide so the two surfaces can never drift. (Type-only import from
 *  lib/operator/setup — that module pulls the server Supabase client.) */
export interface SetupStepMeta {
  title: string;
  blurb: string;
  /** Where the work happens. Null = handled inline by the guide (location,
   *  payments) or resolved from the operator's storefront path (testDrive). */
  href: string | null;
  cta: string;
  icon: Icon;
  /** Shown in place of the blurb once the step is done. */
  doneNote: string;
}

export const SETUP_STEPS: Record<SetupStepKey, SetupStepMeta> = {
  location: {
    title: "Set your service area",
    blurb: "Where you deliver — it sets your storefront's area and your local weather advisory.",
    href: null,
    cta: "Add location",
    icon: MapPin,
    doneNote: "Service area saved.",
  },
  items: {
    title: "Add your rentals",
    blurb: "The items customers browse, get quoted on, and book from your storefront.",
    href: "/inventory",
    cta: "Add items",
    icon: Package,
    doneNote: "Your catalog is live.",
  },
  payments: {
    title: "Get paid",
    blurb: "Connect Stripe so deposits and balances land in your bank account.",
    href: null,
    cta: "Connect Stripe",
    icon: CreditCard,
    doneNote: "Stripe connected — payouts go to your bank.",
  },
  documents: {
    title: "Upload your compliance documents",
    blurb:
      "Insurance, license, inspections, permits — with expiry dates. Compliance Watch then warns you before anything lapses.",
    href: "/documents",
    cta: "Upload documents",
    icon: Files,
    doneNote: "Compliance Watch is guarding your paperwork.",
  },
  followUps: {
    title: "Put your follow-up agents to work",
    blurb:
      "Automatic nudges for unpaid balances, unsigned contracts, and quotes that went quiet. Off until you say so.",
    href: "/agents",
    cta: "Open Agents",
    icon: Robot,
    doneNote: "Your follow-up team is on duty.",
  },
  policies: {
    title: "Write your customer policies",
    blurb:
      "Cancellation and damage terms show up on quotes, reminder emails, and the rental agreement.",
    href: "/settings",
    cta: "Set policies",
    icon: Scroll,
    doneNote: "Policies are on every quote and contract.",
  },
  branding: {
    title: "Brand your storefront",
    blurb: "Add your logo — plus a color and tagline — so the storefront and emails look like you.",
    href: "/settings",
    cta: "Add your logo",
    icon: Palette,
    doneNote: "Your storefront wears your brand.",
  },
  voice: {
    title: "Brief your assistant",
    blurb:
      "Tell the AI how you talk, what to recommend, and your house rules. Quotes, follow-ups, and drafted replies all use it.",
    href: "/agents",
    cta: "Write instructions",
    icon: ChatCircleDots,
    doneNote: "Your team knows how you sound.",
  },
  testDrive: {
    title: "Take it for a test drive",
    blurb:
      "Ask your own storefront a question and watch the quote come back — see what a customer sees before one shows up.",
    href: null,
    cta: "Open your storefront",
    icon: Rocket,
    doneNote: "You've seen the customer's side.",
  },
};
