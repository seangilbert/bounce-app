import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

/**
 * Returns a service-role Supabase client for trusted server-side writes —
 * webhook handlers, background jobs, etc. — that run with no user session.
 *
 * This client uses SUPABASE_SERVICE_ROLE_KEY and BYPASSES row-level security.
 * NEVER import it into client components or anything reachable from the
 * browser, and never expose the key. For user-scoped, RLS-enforced access
 * from Server Components / Route Handlers, use `createClient` from `./server`.
 *
 * Constructed lazily so a missing key only fails the request that needs it,
 * not the whole app at boot.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local.");
  }
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local.");
  }
  if (!admin) {
    admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
