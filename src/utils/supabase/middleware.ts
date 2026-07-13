import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Header the middleware uses to hand the *verified* user id to Server
 *  Components, so they don't repeat the auth round-trip. Never trusted inbound. */
export const VERIFIED_USER_HEADER = "x-operator-user-id";

const OPERATOR_PREFIXES = [
  "/dashboard",
  "/calendar",
  "/bookings",
  "/inquiries",
  "/deliveries",
  "/inventory",
  "/settings",
  "/more",
  "/billing",
  "/connect",
  "/onboarding",
];

/** The renter's self-service portal — a *different* principal to the operator
 *  app (see lib/customers/session.ts), so it gets its own gate and its own
 *  sign-in page. `/my/login` is carved out below: it must stay reachable while
 *  signed out, or there'd be no way in. */
const CUSTOMER_PREFIXES = ["/my"];
const CUSTOMER_LOGIN = "/my/login";

/**
 * Refreshes the Supabase auth session and gates the operator app.
 *
 * Perf: `auth.getUser()` is a network round-trip to Supabase Auth on every
 * request, so we (1) skip it entirely for public routes (storefront, public
 * APIs) that don't need auth, and (2) forward the verified user id to Server
 * Components via a trusted request header — they read that instead of paying a
 * second `getUser()`. The header is stripped from inbound requests so it can't
 * be spoofed; it's only ever set here, after a real verification.
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // "/" is now the public marketing homepage — not gated. Operator surfaces are
  // the prefixes below (the app redirects unauthenticated visitors to /login).
  const isOperatorRoute = OPERATOR_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const isAuthPage = path === "/login" || path === "/signup";
  // The portal, minus its own sign-in page.
  const isCustomerRoute =
    path !== CUSTOMER_LOGIN &&
    CUSTOMER_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  // The storefront is PUBLIC but session-AWARE: a signed-in renter sees their
  // saved items, their conversation, and their name in the rail. It therefore
  // needs its access token refreshed like any other authenticated surface —
  // Server Components can't set cookies, so if the middleware doesn't rotate it
  // here, the token silently expires and the customer appears logged out.
  //
  // But the storefront is also the public funnel, and most visitors are guests.
  // Paying a getUser() round-trip on every guest page view to serve the minority
  // who are signed in would be backwards — so we only opt in when the request
  // actually carries a Supabase auth cookie. Guests cost exactly nothing.
  const isStorefront = path.startsWith("/s/") || path === "/book";
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));

  // /my/login needs the session *refreshed* (so an already-signed-in renter is
  // recognised and bounced onward) but must never be *gated* — hence it's in the
  // "touch auth" set while staying out of isCustomerRoute.
  const touchesAuth =
    isOperatorRoute ||
    isAuthPage ||
    isCustomerRoute ||
    path === CUSTOMER_LOGIN ||
    (isStorefront && hasAuthCookie);

  // Strip our internal header from anything inbound — only this function sets it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(VERIFIED_USER_HEADER);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Public routes don't need auth — skip the getUser round-trip and the session
  // refresh. (Operator-scoped API routes not matched here verify for real via
  // getSessionOperator's fallback.)
  if (!supabaseUrl || !supabaseAnonKey || !touchesAuth) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let refreshedCookies: { name: string; value: string; options?: CookieOptions }[] = [];
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        refreshedCookies = cookiesToSet;
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      },
    },
  });

  // getUser() revalidates the token with the Supabase Auth server. Do not trust
  // getSession() here — this is the authoritative check the whole app relies on.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isOperatorRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (path !== "/") url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (!user && isCustomerRoute) {
    const url = request.nextUrl.clone();
    url.pathname = CUSTOMER_LOGIN;
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Note what we deliberately DON'T do: bounce an authenticated visitor away
  // from /my/login. Telling the two principals apart needs a DB read, and this
  // runs at the edge on every request — so both "signed-in" checks are pushed
  // into the pages, which can afford the lookup:
  //
  //   /my/login  → if the session is a renter, the page redirects to /my.
  //   (operator) → if the session is a renter with no membership, the operator
  //                layout redirects to /my.
  //
  // Doing either one HERE by guessing would loop: an operator sent from
  // /my/login → /my would be gated back to /my/login forever, since a session
  // alone doesn't make them a renter.

  // Hand the verified id to Server Components; attach any rotated cookies.
  if (user) requestHeaders.set(VERIFIED_USER_HEADER, user.id);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  refreshedCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
