import type { Metadata } from "next";
import { Montserrat, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { CookieNotice } from "@/components/legal/CookieNotice";
import { publicOrigin } from "@/lib/urls";

// Display face = Montserrat, matching the Movables logo wordmark so headings
// and the logo share one typeface.
const display = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for OG/Twitter/icon URLs shared to crawlers. The marketing
  // pages (which carry the share cards) live on the PUBLIC host.
  metadataBase: new URL(publicOrigin()),
  title: "Movables — Operator",
  description: "Movables operator app.",
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans text-ink antialiased">
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
