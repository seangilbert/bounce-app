import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

// Overrides the root layout's operator-app metadata for public marketing pages.
export const metadata: Metadata = {
  title: "Bounce — Your AI office manager for party rentals",
  description:
    "Stop losing bookings to slow replies. Bounce answers every customer instantly with accurate quotes from your real inventory, plus booking, payments, e-signed contracts, and delivery — all in one place.",
  openGraph: {
    title: "Bounce — Your AI office manager for party rentals",
    description:
      "Customers book whoever answers first. Bounce replies to every inquiry instantly so you never miss another booking request.",
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
