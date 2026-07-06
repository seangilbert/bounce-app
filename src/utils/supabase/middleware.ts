import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session and forwards updated cookies.
 *
 * Called from the root `middleware.ts`. Because Server Components cannot
 * write cookies, this keeps the session token fresh on every request and
 * writes the rotated cookies onto both the request (for downstream Server
 * Components) and the response (for the browser).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Skip session refresh until Supabase credentials are configured, so the
  // app still boots on a fresh clone without a populated `.env.local`.
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to
  // debug issues with users being randomly logged out.

  // IMPORTANT: getUser() revalidates the token with the Supabase Auth
  // server on every request. Do not trust getSession() in server code.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate the operator app. The public storefront (/book, /api/items, …) and the
  // login page stay open.
  const path = request.nextUrl.pathname;
  const OPERATOR_PREFIXES = [
    "/dashboard",
    "/calendar",
    "/inquiries",
    "/deliveries",
    "/inventory",
    "/settings",
    "/more",
  ];
  const isOperatorRoute =
    path === "/" || OPERATOR_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && isOperatorRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (path !== "/") url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
