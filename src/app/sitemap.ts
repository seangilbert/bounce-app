import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bounce-app.vercel.app";

// Public, indexable pages. Per-operator storefronts (/s/[slug]) are intentionally
// omitted for now — they'd need to be enumerated from the DB.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: "", priority: 1 },
    { path: "/pricing", priority: 0.8 },
    { path: "/terms", priority: 0.3 },
    { path: "/privacy", priority: 0.3 },
  ];
  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    changeFrequency: "monthly" as const,
    priority: r.priority,
  }));
}
