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
  const isOperatorRoute =
    path === "/" || OPERATOR_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const isAuthPage = path === "/login" || path === "/signup";

  // Strip our internal header from anything inbound — only this function sets it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(VERIFIED_USER_HEADER);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Public routes don't need auth — skip the getUser round-trip and the session
  // refresh. (Operator-scoped API routes not matched here verify for real via
  // getSessionOperator's fallback.)
  if (!supabaseUrl || !supabaseAnonKey || (!isOperatorRoute && !isAuthPage)) {
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
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Hand the verified id to Server Components; attach any rotated cookies.
  if (user) requestHeaders.set(VERIFIED_USER_HEADER, user.id);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  refreshedCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
