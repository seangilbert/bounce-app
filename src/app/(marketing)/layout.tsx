import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

// Overrides the root layout's operator-app metadata for public marketing pages.
export const metadata: Metadata = {
  title: "Bounce — Software for party & equipment rental operators",
  description:
    "Bounce is the all-in-one platform for rental operators: an AI quote assistant that answers customers instantly, plus booking, payments, e-signed contracts, and delivery routing.",
  openGraph: {
    title: "Bounce — Software for party & equipment rental operators",
    description:
      "Quote every party in seconds. Booking, payments, contracts, and delivery — one platform, built AI-first.",
    type: "website",
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
