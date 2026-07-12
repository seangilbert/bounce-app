import { describe, it, expect } from "vitest";
import { normalizeSchedule, isDateBookable, assessRange } from "./schedule";

describe("normalizeSchedule", () => {
  it("defaults to all days open when operatingDays is missing", () => {
    expect(normalizeSchedule(null).operatingDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("dedupes, sorts, and drops out-of-range weekdays", () => {
    const s = normalizeSchedule({ operatingDays: [6, 1, 1, 9, -1, 3] });
    expect(s.operatingDays).toEqual([1, 3, 6]);
  });

  it("falls back to all days when operatingDays filters to empty", () => {
    expect(normalizeSchedule({ operatingDays: [99] }).operatingDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("keeps only well-formed blackout ranges and swaps reversed ones", () => {
    const s = normalizeSchedule({
      blackouts: [
        { start: "2026-07-10", end: "2026-07-12" },
        { start: "2026-08-05", end: "2026-08-01" }, // reversed → swapped
        { start: "bad", end: "2026-01-01" }, // dropped
      ],
    });
    expect(s.blackouts).toEqual([
      { start: "2026-07-10", end: "2026-07-12" },
      { start: "2026-08-01", end: "2026-08-05" },
    ]);
  });

  it("defaults a single-day blackout end to its start", () => {
    const s = normalizeSchedule({ blackouts: [{ start: "2026-07-04" }] });
    expect(s.blackouts).toEqual([{ start: "2026-07-04", end: "2026-07-04" }]);
  });

  it("trims and drops empty delivery windows", () => {
    const s = normalizeSchedule({ deliveryWindows: ["  8–10am ", "", "  "] });
    expect(s.deliveryWindows).toEqual(["8–10am"]);
  });
});

describe("isDateBookable", () => {
  // 2026-07-04 is a Saturday (day 6); 2026-07-06 is a Monday (day 1).
  it("is false on a non-operating weekday", () => {
    const s = normalizeSchedule({ operatingDays: [1, 2, 3, 4, 5] }); // weekdays only
    expect(isDateBookable(s, "2026-07-04")).toBe(false); // Saturday
    expect(isDateBookable(s, "2026-07-06")).toBe(true); // Monday
  });

  it("is false inside a blackout even on an operating day", () => {
    const s = normalizeSchedule({ blackouts: [{ start: "2026-07-06", end: "2026-07-08" }] });
    expect(isDateBookable(s, "2026-07-06")).toBe(false);
    expect(isDateBookable(s, "2026-07-09")).toBe(true);
  });
});

describe("assessRange", () => {
  it("passes an all-open range", () => {
    expect(assessRange(normalizeSchedule({}), "2026-07-06", "2026-07-08")).toEqual({ ok: true });
  });

  it("rejects when the delivery (start) day is not an operating day", () => {
    const s = normalizeSchedule({ operatingDays: [1, 2, 3, 4, 5] });
    const r = assessRange(s, "2026-07-04", "2026-07-05"); // starts Saturday
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Saturday");
  });

  it("rejects when any day in the range is blacked out", () => {
    const s = normalizeSchedule({ blackouts: [{ start: "2026-07-07", end: "2026-07-07" }] });
    const r = assessRange(s, "2026-07-06", "2026-07-08"); // blackout mid-range
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not available/i);
  });

  it("detects a blackout on the final day of the range (boundary)", () => {
    const s = normalizeSchedule({ blackouts: [{ start: "2026-07-08", end: "2026-07-08" }] });
    expect(assessRange(s, "2026-07-06", "2026-07-08").ok).toBe(false);
  });

  it("passes bad input through to other validation", () => {
    expect(assessRange(normalizeSchedule({}), "not-a-date", "2026-07-08")).toEqual({ ok: true });
  });
});
