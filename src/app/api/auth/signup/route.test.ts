import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The route pulls in heavy server deps; the gate we're testing runs before any
// of them, so stub them to no-ops.
const { checkRateLimit } = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/inventory/repo", () => ({ generateUniqueSlug: vi.fn() }));
vi.mock("@/lib/branding/palette", () => ({ accentForIndex: () => "#000" }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(body),
    }),
  );

const original = process.env.NEXT_PUBLIC_SIGNUPS_OPEN;
beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 5, resetAt: 0 });
});
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SIGNUPS_OPEN;
  else process.env.NEXT_PUBLIC_SIGNUPS_OPEN = original;
});

const validBody = {
  businessName: "Test Rentals",
  email: "op@example.com",
  password: "supersecret",
  plan: "free",
};

describe("POST /api/auth/signup — the closed gate", () => {
  it("403s while signups are closed, before doing anything else", async () => {
    delete process.env.NEXT_PUBLIC_SIGNUPS_OPEN; // closed (default)

    const res = await post(validBody);

    expect(res.status).toBe(403);
    // The whole point: refuses at the source. It must not even reach the rate
    // limiter, let alone create an account.
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("gets past the gate when signups are open", async () => {
    process.env.NEXT_PUBLIC_SIGNUPS_OPEN = "true";
    // Prove it passed the 403 by letting the NEXT step (rate limit) reject.
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });

    const res = await post(validBody);

    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledOnce();
  });
});
