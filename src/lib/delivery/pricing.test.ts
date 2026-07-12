import { describe, it, expect } from "vitest";
import {
  normalizeDeliveryConfig,
  normalizeZip,
  normalizeTown,
  haversineMiles,
  resolveDeliveryFee,
  type DeliveryConfig,
} from "./pricing";

describe("normalizeZip", () => {
  it("extracts the first 5 digits", () => {
    expect(normalizeZip("94103-1234")).toBe("94103");
  });
  it("returns empty for non-ZIP input", () => {
    expect(normalizeZip("abc")).toBe("");
    expect(normalizeZip(null)).toBe("");
    expect(normalizeZip(undefined)).toBe("");
  });
});

describe("normalizeTown", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeTown("  San   Francisco ")).toBe("san francisco");
  });
});

describe("normalizeDeliveryConfig", () => {
  it("defaults an empty/garbage config safely", () => {
    const c = normalizeDeliveryConfig(null);
    expect(c.zones).toEqual([]);
    expect(c.outOfAreaCents).toBeNull();
    expect(c.distance).toEqual({ freeMiles: 0, perMileCents: 0, maxMiles: null });
  });

  it("clamps negative fees and coerces numbers", () => {
    const c = normalizeDeliveryConfig({
      zones: [{ id: "z1", label: "North", feeCents: -50, zips: ["94103-9999"], towns: ["  Oakland "] }],
      outOfAreaCents: -10,
      distance: { freeMiles: -5, perMileCents: "200", maxMiles: 30 },
    });
    expect(c.zones[0].feeCents).toBe(0);
    expect(c.zones[0].zips).toEqual(["94103"]);
    expect(c.zones[0].towns).toEqual(["oakland"]);
    expect(c.outOfAreaCents).toBe(0);
    expect(c.distance).toEqual({ freeMiles: 0, perMileCents: 200, maxMiles: 30 });
  });

  it("preserves null outOfAreaCents (quote-by-hand) distinct from 0", () => {
    expect(normalizeDeliveryConfig({ outOfAreaCents: null }).outOfAreaCents).toBeNull();
    expect(normalizeDeliveryConfig({ outOfAreaCents: 0 }).outOfAreaCents).toBe(0);
  });
});

describe("haversineMiles", () => {
  it("is zero for identical points", () => {
    expect(haversineMiles({ lat: 37.77, lon: -122.42 }, { lat: 37.77, lon: -122.42 })).toBe(0);
  });
  it("approximates a known distance (SF ↔ LA ≈ 347 mi)", () => {
    const d = haversineMiles({ lat: 37.7749, lon: -122.4194 }, { lat: 34.0522, lon: -118.2437 });
    expect(d).toBeGreaterThan(340);
    expect(d).toBeLessThan(360);
  });
});

const cfg = (over: Partial<DeliveryConfig> = {}): DeliveryConfig => ({
  zones: [],
  outOfAreaCents: null,
  distance: { freeMiles: 0, perMileCents: 0, maxMiles: null },
  ...over,
});

describe("resolveDeliveryFee — flat", () => {
  it("returns the flat fee regardless of location", () => {
    const q = resolveDeliveryFee("flat", cfg(), 2500, {});
    expect(q).toEqual({ feeCents: 2500, outOfArea: false, needsLocation: false });
  });
});

describe("resolveDeliveryFee — zones", () => {
  const zoneCfg = cfg({
    zones: [{ id: "z1", label: "In town", feeCents: 1000, zips: ["94103"], towns: ["oakland"] }],
    outOfAreaCents: 5000,
  });

  it("needs a location when neither zip nor town is given", () => {
    const q = resolveDeliveryFee("zones", zoneCfg, 0, {});
    expect(q).toEqual({ feeCents: null, outOfArea: false, needsLocation: true });
  });

  it("matches by ZIP", () => {
    const q = resolveDeliveryFee("zones", zoneCfg, 0, { zip: "94103" });
    expect(q.feeCents).toBe(1000);
    expect(q.label).toBe("In town");
  });

  it("matches by town (case-insensitive)", () => {
    const q = resolveDeliveryFee("zones", zoneCfg, 0, { town: "Oakland" });
    expect(q.feeCents).toBe(1000);
  });

  it("falls back to the outside-area fee when no zone matches", () => {
    const q = resolveDeliveryFee("zones", zoneCfg, 0, { zip: "99999" });
    expect(q.feeCents).toBe(5000);
    expect(q.outOfArea).toBe(false);
  });

  it("is out of area (unpriceable) when no match and outside fee is null", () => {
    const noOutside = cfg({ zones: zoneCfg.zones, outOfAreaCents: null });
    const q = resolveDeliveryFee("zones", noOutside, 0, { zip: "99999" });
    expect(q).toEqual({ feeCents: null, outOfArea: true, needsLocation: false });
  });
});

describe("resolveDeliveryFee — distance", () => {
  const origin = { lat: 37.7749, lon: -122.4194 };
  const distCfg = cfg({ distance: { freeMiles: 5, perMileCents: 200, maxMiles: 50 } });

  it("needs a location when destination coords are missing", () => {
    const q = resolveDeliveryFee("distance", distCfg, 1000, {}, origin);
    expect(q.needsLocation).toBe(true);
    expect(q.feeCents).toBeNull();
  });

  it("needs a location when the origin is missing", () => {
    const q = resolveDeliveryFee("distance", distCfg, 1000, { lat: 37.78, lon: -122.41 });
    expect(q.needsLocation).toBe(true);
  });

  it("charges only the base fee within the free radius", () => {
    // ~0.6 mi away, inside 5 free miles → base fee only
    const q = resolveDeliveryFee("distance", distCfg, 1000, { lat: 37.78, lon: -122.41 }, origin);
    expect(q.feeCents).toBe(1000);
    expect(q.outOfArea).toBe(false);
  });

  it("adds per-mile beyond the free radius", () => {
    // ~347 mi would exceed max; use a point ~10 mi out instead.
    const q = resolveDeliveryFee("distance", cfg({ distance: { freeMiles: 5, perMileCents: 200, maxMiles: null } }), 1000, { lat: 37.9, lon: -122.42 }, origin);
    expect(q.feeCents).toBeGreaterThan(1000); // base + billable miles
    expect(q.miles).toBeGreaterThan(5);
  });

  it("is out of area beyond the max radius", () => {
    const q = resolveDeliveryFee("distance", distCfg, 1000, { lat: 34.0522, lon: -118.2437 }, origin);
    expect(q.outOfArea).toBe(true);
    expect(q.feeCents).toBeNull();
  });
});
