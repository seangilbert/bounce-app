import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";
import { frameAncestorsForKey } from "@/lib/api/embed-csp";
import { hostRoutingTarget, appHost, publicHost, appUrl, publicUrl } from "@/lib/urls";

/**
 * Send each request to the host it belongs on when the marketing/app domain
 * split is active (movables.ai vs app.movables.ai — see the DECISION in
 * docs/ROADMAP.md). The decision itself is `hostRoutingTarget` (pure, tested);
 * this just turns it into a redirect. Inert on single-origin deploys, preview
 * URLs, and localhost.
 */
function hostRedirect(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  const target = hostRoutingTarget(request.headers.get("host"), pathname, {
    app: appHost(),
    public: publicHost(),
  });
  if (!target) return null;
  const dest = target === "app" ? appUrl(pathname + search) : publicUrl(pathname + search);
  return NextResponse.redirect(dest);
}

export async function middleware(request: NextRequest) {
  // The embeddable storefront: restrict who can frame it to the key's registered
  // origins (defense against a third party embedding an operator's storefront).
  if (request.nextUrl.pathname === "/embed") {
    const res = NextResponse.next();
    const csp = await frameAncestorsForKey(request.nextUrl.searchParams.get("key"));
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }
  // Host routing runs before any auth/session work — no point refreshing a
  // session on a request we're about to bounce to the other host.
  const redirect = hostRedirect(request);
  if (redirect) return redirect;

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
