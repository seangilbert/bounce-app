import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { CookieNotice } from "@/components/legal/CookieNotice";

const display = Bricolage_Grotesque({
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
  title: "Movables — Operator",
  description: "Movables operator app.",
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
