import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";
import { frameAncestorsForKey } from "@/lib/api/embed-csp";

export async function middleware(request: NextRequest) {
  // The embeddable storefront: restrict who can frame it to the key's registered
  // origins (defense against a third party embedding an operator's storefront).
  if (request.nextUrl.pathname === "/embed") {
    const res = NextResponse.next();
    const csp = await frameAncestorsForKey(request.nextUrl.searchParams.get("key"));
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/webhooks (provider callbacks — no session, need the raw body)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - image assets
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
