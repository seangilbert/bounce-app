import { describe, it, expect } from "vitest";
import { toE164US, hasPhoneDigits } from "./phone";

describe("toE164US", () => {
  it("returns null for empty input", () => {
    expect(toE164US(null)).toBeNull();
    expect(toE164US(undefined)).toBeNull();
    expect(toE164US("")).toBeNull();
  });

  it("passes through an already-valid E.164 number", () => {
    expect(toE164US("+14155551234")).toBe("+14155551234");
  });

  it("adds +1 to a bare 10-digit US number", () => {
    expect(toE164US("415-555-1234")).toBe("+14155551234");
    expect(toE164US("(415) 555 1234")).toBe("+14155551234");
  });

  it("handles an 11-digit number with a leading 1", () => {
    expect(toE164US("1 415 555 1234")).toBe("+14155551234");
  });

  it("returns null for too few or too many digits", () => {
    expect(toE164US("555-1234")).toBeNull();
    expect(toE164US("415 555 1234 999")).toBeNull();
  });

  it("returns null for an 11-digit number not starting with 1", () => {
    expect(toE164US("24155551234")).toBeNull();
  });
});

describe("hasPhoneDigits", () => {
  it("is true with at least 10 digits", () => {
    expect(hasPhoneDigits("call me at 415 555 1234")).toBe(true);
  });
  it("is false with fewer than 10 digits", () => {
    expect(hasPhoneDigits("ext 1234")).toBe(false);
  });
});
