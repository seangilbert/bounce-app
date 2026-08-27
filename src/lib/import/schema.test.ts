import { describe, expect, it } from "vitest";
import { applyEnrichment, parseCsv, planActivation, toCsvLine, type StagedItem } from "./schema";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('name,size\n"Red, White and Blue","35\'\' L X 17"" H"\n"say ""hi""",x')).toEqual([
      ["name", "size"],
      ["Red, White and Blue", "35'' L X 17\" H"],
      ['say "hi"', "x"],
    ]);
  });

  it("handles CRLF line endings and drops blank lines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps a multi-line quoted field intact", () => {
    expect(parseCsv('a\n"line one\nline two"')).toEqual([["a"], ["line one\nline two"]]);
  });
});

describe("toCsvLine", () => {
  it("round-trips fields needing quoting", () => {
    const fields = ["Red, White and Blue", 'say "hi"', "plain"];
    expect(parseCsv(toCsvLine(fields))[0]).toEqual(fields);
  });
});

describe("applyEnrichment", () => {
  const staged = (over: Partial<StagedItem>): StagedItem => ({
    name: "Item",
    category: "bounce",
    description: null,
    quantity: 1,
    basePrice: 10000,
    priceUnit: "per_day",
    footprint: { w: null, l: null, h: null },
    powerRequired: true,
    images: [],
    active: true,
    confidence: "high",
    notes: null,
    sourceRow: 1,
    ...over,
  });

  it("fills blanks but never overwrites spreadsheet-derived data", () => {
    const items = [staged({ description: "keep me", footprint: { w: 10, l: null, h: null } })];
    const out = applyEnrichment(items, {
      patches: [
        {
          index: 0,
          description: "from the site",
          images: ["https://x.com/a.jpg"],
          footprint: { w: 99, l: 20, h: 15 },
        },
      ],
      newItems: [],
      warnings: [],
    });
    expect(out[0].description).toBe("keep me");
    expect(out[0].footprint).toEqual({ w: 10, l: 20, h: 15 });
    expect(out[0].images).toEqual(["https://x.com/a.jpg"]);
  });

  it("dedupes images and ignores out-of-range patch indexes", () => {
    const items = [staged({ images: ["https://x.com/a.jpg"] })];
    const out = applyEnrichment(items, {
      patches: [
        { index: 0, description: null, images: ["https://x.com/a.jpg", "https://x.com/b.jpg"], footprint: null },
        { index: 7, description: "nope", images: [], footprint: null },
      ],
      newItems: [],
      warnings: [],
    });
    expect(out[0].images).toEqual(["https://x.com/a.jpg", "https://x.com/b.jpg"]);
    expect(out).toHaveLength(1);
  });

  it("appends site-only items unless a staged name already matches", () => {
    const items = [staged({ name: "Bundle Discount" })];
    const out = applyEnrichment(items, {
      patches: [],
      newItems: [staged({ name: "bundle discount" }), staged({ name: "Popcorn Machine" })],
      warnings: [],
    });
    expect(out.map((i) => i.name)).toEqual(["Bundle Discount", "Popcorn Machine"]);
  });
});

describe("planActivation", () => {
  it("activates everything under an infinite cap", () => {
    expect(planActivation([true, true, false], 100, Infinity)).toEqual([true, true, false]);
  });

  it("fills only the remaining slots, in order", () => {
    // cap 5, 3 already live -> 2 slots for the 4 that want to be live.
    expect(planActivation([true, true, true, false, true], 3, 5)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("never activates when already at or over the cap", () => {
    expect(planActivation([true, true], 5, 5)).toEqual([false, false]);
    expect(planActivation([true], 9, 5)).toEqual([false]);
  });

  it("respects items the operator chose to keep hidden", () => {
    expect(planActivation([false, true], 0, 5)).toEqual([false, true]);
  });
});
