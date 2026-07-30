import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The route's only real dependency is the server Supabase client; stub it so we
// can drive exchangeCodeForSession's outcome per test.
const { exchangeCodeForSession } = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: () => ({ auth: { exchangeCodeForSession } }),
}));

import { GET } from "./route";

const get = (url: string, headers: Record<string, string> = {}) =>
  GET(new Request(url, { headers }));

/** NextResponse.redirect → 307 with the target in the `location` header. */
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  vi.clearAllMocks();
  exchangeCodeForSession.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /auth/callback", () => {
  it("bounces to /login with an error when no code is present", async () => {
    const res = await get("http://localhost/auth/callback");

    expect(res.status).toBe(307);
    expect(location(res)).toMatch(/^http:\/\/localhost\/login\?error=/);
    // Must not attempt an exchange with nothing to exchange.
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("exchanges the code and forwards to /reset-password by default", async () => {
    const res = await get("http://localhost/auth/callback?code=abc123");

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(res.status).toBe(307);
    expect(location(res)).toBe("http://localhost/reset-password");
  });

  it("honours a same-origin relative `next`", async () => {
    const res = await get("http://localhost/auth/callback?code=abc123&next=/account/security");

    expect(location(res)).toBe("http://localhost/account/security");
  });

  it("bounces to /login when the exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad code" } });

    const res = await get("http://localhost/auth/callback?code=expired");

    expect(res.status).toBe(307);
    expect(location(res)).toMatch(/^http:\/\/localhost\/login\?error=/);
  });

  it.each([
    ["absolute external URL", "https://evil.com/steal"],
    ["protocol-relative URL", "//evil.com/steal"],
  ])("ignores an open-redirect via `next` (%s) and falls back to /reset-password", async (_label, next) => {
    const res = await get(`http://localhost/auth/callback?code=abc123&next=${encodeURIComponent(next)}`);

    expect(location(res)).toBe("http://localhost/reset-password");
  });

  it("redirects to the forwarded host in production, not the proxy origin", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await get("http://internal-proxy/auth/callback?code=abc123", {
      "x-forwarded-host": "app.movables.com",
    });

    expect(location(res)).toBe("https://app.movables.com/reset-password");
  });
});
