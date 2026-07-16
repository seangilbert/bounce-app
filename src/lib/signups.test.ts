import { describe, it, expect, afterEach } from "vitest";
import { signupsOpen, earlyAccessHref, EARLY_ACCESS_EMAIL } from "./signups";

const original = process.env.NEXT_PUBLIC_SIGNUPS_OPEN;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SIGNUPS_OPEN;
  else process.env.NEXT_PUBLIC_SIGNUPS_OPEN = original;
});

describe("signupsOpen — fail-safe closed", () => {
  it("is open ONLY for the exact string 'true'", () => {
    process.env.NEXT_PUBLIC_SIGNUPS_OPEN = "true";
    expect(signupsOpen()).toBe(true);
  });

  it("is closed when the flag is unset (the default)", () => {
    delete process.env.NEXT_PUBLIC_SIGNUPS_OPEN;
    expect(signupsOpen()).toBe(false);
  });

  it("is closed for anything that isn't exactly 'true' — no accidental opens", () => {
    for (const v of ["false", "1", "yes", "TRUE", "True", "", " true "]) {
      process.env.NEXT_PUBLIC_SIGNUPS_OPEN = v;
      expect(signupsOpen(), v).toBe(false);
    }
  });
});

describe("early-access link", () => {
  it("is a mailto to the Movables address with a subject", () => {
    expect(earlyAccessHref.startsWith(`mailto:${EARLY_ACCESS_EMAIL}?subject=`)).toBe(true);
  });
});
