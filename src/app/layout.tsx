import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bounce App",
  description: "A Next.js 14 App Router project.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
