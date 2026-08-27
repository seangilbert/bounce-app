import { describe, expect, it } from "vitest";
import { parseCsv, planActivation, toCsvLine } from "./schema";

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
