/**
 * Geocode a free-text place ("Plymouth, MA") to coordinates via Open-Meteo's
 * free geocoding API (no key). Used at onboarding to set the operator's location
 * + lat/lon (which drive the weather advisory).
 *
 * Open-Meteo matches on a bare city name, so we split off a "City, Region" hint
 * and pick the result whose state/country matches (Plymouth MA vs Plymouth UK).
 */
export interface GeoResult {
  label: string;
  latitude: number;
  longitude: number;
}

interface OMResult {
  name: string;
  admin1?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
}

// US state abbreviation → full name (Open-Meteo returns full names in admin1).
const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

export async function geocodeLocation(query: string): Promise<GeoResult | null> {
  const [rawCity, rawRegion] = query.split(",").map((s) => s.trim());
  const city = rawCity;
  if (!city) return null;
  const region = rawRegion ? US_STATES[rawRegion.toUpperCase()] ?? rawRegion : null;

  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}` +
    `&count=20&language=en&format=json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const results = ((await res.json()) as { results?: OMResult[] }).results ?? [];
    if (results.length === 0) return null;

    let match = results[0];
    if (region) {
      const r = region.toLowerCase();
      const found = results.find(
        (x) =>
          x.admin1?.toLowerCase() === r ||
          x.country_code?.toLowerCase() === (rawRegion ?? "").toLowerCase(),
      );
      if (found) match = found;
    }

    const label = [match.name, match.admin1].filter(Boolean).join(", ");
    return { label, latitude: match.latitude, longitude: match.longitude };
  } catch {
    return null;
  }
}
