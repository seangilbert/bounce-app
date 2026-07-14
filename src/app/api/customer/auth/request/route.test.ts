import { describe, it, expect, vi, beforeEach } from "vitest";

const { requestLoginCode, checkRateLimit } = vi.hoisted(() => ({
  requestLoginCode: vi.fn(),
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/customers/otp", () => ({ requestLoginCode }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/customer/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(body),
    }) as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 5, resetAt: 0 });
});

describe("POST /api/customer/auth/request — indistinguishable responses", () => {
  // The whole point of the endpoint's design. If any of these diverge, the
  // endpoint becomes an oracle for "has this person rented?".
  it.each([
    ["a code was sent", "sent"],
    ["the mailer is down", "delivery_failed"],
    ["Supabase wouldn't mint a code", "mint_failed"],
  ])("returns the same 200 {ok:true} when %s", async (_label, outcome) => {
    requestLoginCode.mockResolvedValue(outcome);

    const res = await post({ email: "jane@example.com" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("never echoes the outcome back to the caller", async () => {
    requestLoginCode.mockResolvedValue("delivery_failed");
    const body = await (await post({ email: "jane@example.com" })).json();
    // No `sent`, no `outcome`, no `exists` — nothing to read the truth from.
    expect(Object.keys(body)).toEqual(["ok"]);
  });
});

describe("POST /api/customer/auth/request — abuse limits", () => {
  it("rejects a malformed email before touching anything", async () => {
    const res = await post({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(requestLoginCode).not.toHaveBeenCalled();
  });

  it("rate-limits per IP", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 0 });
    const res = await post({ email: "jane@example.com" });
    expect(res.status).toBe(429);
    expect(requestLoginCode).not.toHaveBeenCalled();
  });

  it("rate-limits per EMAIL too — so one victim's inbox can't be flooded from many IPs", async () => {
    checkRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 5, resetAt: 0 }) // per-IP passes
      .mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 0 }); // per-email trips

    const res = await post({ email: "victim@example.com" });

    expect(res.status).toBe(429);
    expect(requestLoginCode).not.toHaveBeenCalled();
    // Keyed on the victim's address, normalized — not the requester's IP.
    expect(checkRateLimit).toHaveBeenNthCalledWith(2, "cust-otp-email:victim@example.com", 5, 900000);
  });

  it("normalizes the email before rate-limiting, so casing can't bypass the cap", async () => {
    requestLoginCode.mockResolvedValue("sent");
    await post({ email: "  Victim@Example.COM " });
    expect(checkRateLimit).toHaveBeenNthCalledWith(2, "cust-otp-email:victim@example.com", 5, 900000);
  });
});
