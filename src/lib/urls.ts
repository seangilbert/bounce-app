/**
 * The two hosts the app answers to (see the marketing-site domain DECISION in
 * docs/ROADMAP.md):
 *
 *   PUBLIC  — marketing + storefronts + renter portal + pay   (movables.ai)
 *   APP     — the operator app + login / signup / invite       (app.movables.ai)
 *
 * It's ONE Next.js deployment serving both hostnames; the middleware routes by
 * the Host header. Everything here degrades to single-host behavior until the
 * two hosts are actually configured and distinct, so nothing changes on the
 * current single-origin deploy until the env vars are set in Vercel.
 */

const FALLBACK = "https://bounce-app.vercel.app";

function toOrigin(v: string | undefined): string | null {
  if (!v) return null;
  try {
    return new URL(v).origin;
  } catch {
    return null;
  }
}

const PUBLIC = toOrigin(process.env.NEXT_PUBLIC_SITE_URL);
const APP = toOrigin(process.env.NEXT_PUBLIC_APP_URL);

/**
 * True only when the operator app really lives on a DIFFERENT origin from the
 * public site — i.e. both hosts are set and distinct. This is the master switch:
 * host-based redirects and cross-host link generation only happen when it's on.
 * Set the two env vars to the same value (or leave either unset) and the whole
 * split stays inert.
 */
export function splitEnabled(): boolean {
  return !!PUBLIC && !!APP && PUBLIC !== APP;
}

/** Origin for the PUBLIC site (marketing / storefront / portal / pay). */
export function publicOrigin(): string {
  return PUBLIC ?? APP ?? FALLBACK;
}

/** Origin for the operator APP (dashboard / login / signup / invite). */
export function appOrigin(): string {
  return APP ?? PUBLIC ?? FALLBACK;
}

/** The bare hostnames, for the middleware's Host-header comparison. */
export function publicHost(): string | null {
  return PUBLIC ? new URL(PUBLIC).host : null;
}
export function appHost(): string | null {
  return APP ? new URL(APP).host : null;
}

/**
 * Absolute URL on the PUBLIC host — for links that leave the app (emails, SMS):
 * a customer's pay link, a storefront link. These must always be absolute; when
 * the split is off they resolve to the single configured origin, unchanged.
 */
export function publicUrl(path: string): string {
  return publicOrigin() + path;
}

/** Absolute URL on the APP host — operator-facing external links (team invites). */
export function appUrl(path: string): string {
  return appOrigin() + path;
}

/**
 * Which host a path belongs on. Operator surfaces + the auth/onboarding pages
 * live on the APP host; everything else that renders a page is PUBLIC. `/api/*`
 * and static assets are served on BOTH and never redirected (they're called from
 * whichever host's pages need them), so they're deliberately not classified here.
 */
const APP_PATH_PREFIXES = [
  "/dashboard",
  "/calendar",
  "/bookings",
  "/inquiries",
  "/deliveries",
  "/inventory",
  "/customers",
  "/documents",
  "/promos",
  "/settings",
  "/account",
  "/more",
  "/billing",
  "/connect",
  "/onboarding",
  "/login",
  "/signup",
  "/invite",
];

export function isAppPath(path: string): boolean {
  return APP_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Pure routing decision for the middleware: given the request's host + path and
 * the two configured hosts, which host should serve it — `"app"`, `"public"`, or
 * `null` to leave the request where it is.
 *
 * Extracted so the whole redirect matrix is unit-testable without touching env
 * or the edge runtime. Returns null (no routing) when the split is off (hosts
 * unset or identical), when the request is on some other host (preview,
 * localhost, the www redirect), or for `/api/*` and `/embed`, which are served
 * on both hosts.
 */
export function hostRoutingTarget(
  host: string | null,
  path: string,
  hosts: { app: string | null; public: string | null },
): "app" | "public" | null {
  if (!hosts.app || !hosts.public || hosts.app === hosts.public) return null;
  if (host !== hosts.app && host !== hosts.public) return null;
  if (path.startsWith("/api/") || path === "/embed") return null;

  const appPath = isAppPath(path);
  if (host === hosts.public && appPath) return "app";
  if (host === hosts.app && !appPath) return "public";
  return null;
}
