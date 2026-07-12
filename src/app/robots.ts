import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bounce-app.vercel.app";

// Let crawlers index the public marketing + storefront surfaces; keep the
// operator app and API out of the index (they redirect/require auth anyway).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/settings", "/inventory", "/bookings", "/inquiries", "/calendar", "/deliveries", "/promos", "/documents", "/account", "/onboarding", "/connect", "/billing"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
