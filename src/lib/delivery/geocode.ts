import "server-only";

/**
 * Geocode a US street address to coordinates via the free US Census geocoder
 * (no API key, US-only). Used for distance-based delivery pricing. Returns null
 * on any failure so pricing degrades gracefully (treated as "needs location").
 */

export interface Coords {
  lat: number;
  lon: number;
}

interface CensusMatch {
  coordinates?: { x: number; y: number }; // x = lon, y = lat
}
interface CensusResponse {
  result?: { addressMatches?: CensusMatch[] };
}

// Best-effort per-process cache; delivery addresses repeat within a session.
const cache = new Map<string, Coords | null>();

export async function geocodeAddress(address: string, zip?: string | null): Promise<Coords | null> {
  const query = [address.trim(), zip?.trim()].filter(Boolean).join(" ").trim();
  if (!query) return null;
  const key = query.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  const url =
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress" +
    `?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&format=json`;

  let coords: Coords | null = null;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = (await res.json()) as CensusResponse;
      const match = json.result?.addressMatches?.[0]?.coordinates;
      if (match && Number.isFinite(match.x) && Number.isFinite(match.y)) {
        coords = { lat: match.y, lon: match.x };
      }
    }
  } catch {
    coords = null;
  }
  cache.set(key, coords);
  return coords;
}
