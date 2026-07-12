import { describe, it, expect } from "vitest";
import { bookableUnits, outOfServiceUnits } from "./types";

describe("outOfServiceUnits", () => {
  it("sums cleaning, damaged, and repair units", () => {
    expect(outOfServiceUnits({ unitsNeedsCleaning: 1, unitsDamaged: 2, unitsInRepair: 3 })).toBe(6);
  });
});

describe("bookableUnits", () => {
  it("is owned minus out-of-service", () => {
    expect(
      bookableUnits({ quantity: 10, unitsNeedsCleaning: 1, unitsDamaged: 2, unitsInRepair: 0 }),
    ).toBe(7);
  });

  it("never goes negative when out-of-service exceeds owned", () => {
    expect(
      bookableUnits({ quantity: 2, unitsNeedsCleaning: 3, unitsDamaged: 1, unitsInRepair: 0 }),
    ).toBe(0);
  });

  it("equals quantity when nothing is out of service", () => {
    expect(
      bookableUnits({ quantity: 5, unitsNeedsCleaning: 0, unitsDamaged: 0, unitsInRepair: 0 }),
    ).toBe(5);
  });
});
