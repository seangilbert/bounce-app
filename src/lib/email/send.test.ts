import { describe, it, expect } from "vitest";
import { fromHeader } from "./send";

const BASE = "Movables <notifications@movables.ai>";

describe("fromHeader — operator display name on customer-facing sends", () => {
  it("swaps the display name, keeps the verified address", () => {
    expect(fromHeader(BASE, "Bounce USA")).toBe('"Bounce USA via Movables" <notifications@movables.ai>');
  });

  it("no fromName → the configured sender, untouched (operator alerts, platform mail)", () => {
    expect(fromHeader(BASE)).toBe(BASE);
    expect(fromHeader(BASE, "")).toBe(BASE);
    expect(fromHeader(BASE, "   ")).toBe(BASE);
  });

  it("handles a bare-address base (the resend.dev default)", () => {
    expect(fromHeader("onboarding@resend.dev", "Bounce USA")).toBe(
      '"Bounce USA via Movables" <onboarding@resend.dev>',
    );
  });

  it("sanitizes header-hostile characters out of the business name", () => {
    expect(fromHeader(BASE, 'Bad "Actor" <evil@x.com>\r\nBcc: victim@y.com')).toBe(
      '"Bad Actor evil@x.comBcc: victim@y.com via Movables" <notifications@movables.ai>',
    );
  });

  it("falls back to the base when the name sanitizes to nothing or the base has no address", () => {
    expect(fromHeader(BASE, '"<>"')).toBe(BASE);
    expect(fromHeader("not-an-address", "Bounce USA")).toBe("not-an-address");
  });
});
