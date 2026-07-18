import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * CI LOCK — the service-role client is confined to an audited allowlist.
 *
 * `createAdminClient` (`@/utils/supabase/admin`) uses the SUPABASE_SERVICE_ROLE_KEY
 * and BYPASSES Row Level Security entirely. RLS Phase 2 moved every convertible
 * operator/renter surface onto the USER-SCOPED client (`@/utils/supabase/server`)
 * so the DB enforces tenant isolation. This test locks that in: a NEW file that
 * reaches for the service-role client fails here until it's consciously added
 * below — which should only happen for one of the audited categories.
 *
 * If this test fails because you added an import:
 *   • Default: use `@/utils/supabase/server` (user-scoped) so RLS fires. A
 *     user-facing page/action/route in a session context almost always wants this.
 *   • Only if the code genuinely has NO user session or MUST bypass RLS
 *     (webhook, background job, provisioning, guest write, storage bucket op,
 *     the Auth Admin API, or a public/mixed-column storefront read) add the file
 *     to ALLOWLIST under the right category, with the reason.
 *
 * If it fails because you REMOVED the last import from an allowlisted file, delete
 * that file from the list — the list must stay an exact mirror of reality.
 */

const SRC = join(process.cwd(), "src");
const ADMIN_IMPORT = /from\s+["']@\/utils\/supabase\/admin["']/;

/**
 * Every file permitted to import the service-role client, by why it's exempt.
 * Paths are repo-relative, forward-slashed. Keep grouped + commented.
 */
const ALLOWLIST = new Set<string>([
  // — Webhooks + background jobs: no user session exists. —
  "src/lib/billing/webhook.ts", // stripe/signwell/twilio reconciliation
  "src/lib/bookings/expire.ts", // expireStaleCheckouts cron-style job

  // — Provisioning / auth: runs before (or to create) the session. —
  "src/app/api/auth/signup/route.ts", // creates the operator + first member
  "src/lib/customers/accounts.ts", // ensureCustomerAccount on first login
  "src/lib/customers/otp.ts", // portal sign-in code mint/verify (pre-session)
  "src/app/invite/[token]/page.tsx", // invite accept — invitee not yet a member
  "src/app/invite/actions.ts", // invite accept action (public token path)
  "src/app/(operator)/account/page.tsx", // Auth Admin API: getUserById (own metadata)
  "src/lib/operator/members.ts", // team mgmt uses auth.admin.* (create/delete users)
  "src/lib/operator/session.ts", // session bootstrap — resolves membership pre-RLS

  // — Stripe billing / connect: operator session, but money-flow machinery that
  //   writes sensitive columns and is tightly coupled to the Stripe API. —
  "src/app/api/billing/checkout/route.ts",
  "src/app/api/connect/onboard/route.ts",
  "src/app/billing/return/page.tsx",
  "src/app/connect/return/page.tsx",

  // — Public storefront + guest writes: no session, or public/mixed-column reads
  //   that select only safe columns in code (RLS is row-level; a policy would
  //   expose sensitive columns — see Phase 3 decision). —
  "src/lib/inventory/repo.ts", // getOperatorBySlug + shared listItems (public catalog)
  "src/lib/inventory/availability.ts", // reserved_peak RPC (aggregate, no PII)
  "src/lib/bookings/repo.ts", // guest checkout writes + shared booking mutations
  "src/lib/orders/repo.ts", // order writes are all webhook/checkout
  "src/lib/delivery/actions.ts", // previewDeliveryFeeAction — public, no auth
  "src/lib/customers/conversations.ts", // storefront thread resume (renter/public)

  // — Storage bucket ops: storage.objects has its own RLS boundary; table ops in
  //   these files are user-scoped, only the bucket calls use the admin client. —
  "src/lib/documents/repo.ts",
  "src/lib/inventory/photos.ts",
  "src/lib/operator/logo.ts",
  "src/lib/esign/contract-template.ts", // reads the doc row + downloads the file

  // — Mixed data-layer repos: the user-scoped functions carry the Phase 2
  //   isolation; the admin client remains only for the no-session / shared /
  //   public functions in the same file. —
  "src/lib/api-keys/repo.ts", // resolveOperatorByKey (public-API auth, no session)
  "src/lib/customers/repo.ts", // upsertCustomer (storefront/inquiry, no session)
  "src/lib/customers/saved.ts", // storefront save (renter/public)
  "src/lib/customers/portal.ts", // public operator/item names merged into portal
  "src/lib/promos/repo.ts", // booking-flow promo reads (no operator session)
  "src/lib/promos/actions.ts", // storefront promo apply
  "src/lib/usage/ai-quotes.ts", // increment_ai_usage RPC (runs during inquiry)
  "src/lib/inquiries/repo.ts", // createInquiry + appendInquiryMessage (storefront/webhook)
  "src/lib/operator/data.ts", // dashboard/calendar reads (service-role for now; Phase 3-ish)
  "src/lib/operator/deliveries.ts", // delivery board reads (service-role for now)
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Files that actually import the service-role client (repo-relative, POSIX). */
function actualImporters(): Set<string> {
  const found = new Set<string>();
  for (const abs of walk(SRC)) {
    if (abs.endsWith(join("utils", "supabase", "admin.ts"))) continue; // the definition
    if (ADMIN_IMPORT.test(readFileSync(abs, "utf8"))) {
      found.add(relative(process.cwd(), abs).split(sep).join("/"));
    }
  }
  return found;
}

describe("service-role client is confined to the audited allowlist", () => {
  const actual = actualImporters();

  it("sanity: the scan finds the service-role client in use", () => {
    expect(actual.size).toBeGreaterThan(20);
  });

  it("no un-allowlisted file imports the service-role client", () => {
    const unlisted = [...actual].filter((f) => !ALLOWLIST.has(f)).sort();
    expect(
      unlisted,
      `New service-role import(s). Prefer @/utils/supabase/server (user-scoped) so RLS ` +
        `fires; if the file genuinely needs service-role, add it to ALLOWLIST in ` +
        `src/test/service-role-lock.test.ts under the right category:\n  ${unlisted.join("\n  ")}`,
    ).toEqual([]);
  });

  it("no stale allowlist entries (list mirrors reality)", () => {
    const stale = [...ALLOWLIST].filter((f) => !actual.has(f)).sort();
    expect(
      stale,
      `These files no longer import the service-role client — remove them from ` +
        `ALLOWLIST so the lock stays honest:\n  ${stale.join("\n  ")}`,
    ).toEqual([]);
  });
});
