# RLS Plan — scoping (2026-07-17)

Adding **database-enforced tenant isolation** as defense-in-depth, so a forgotten
app-level `.eq("operator_id", …)` can't leak cross-tenant data. Today isolation
lives entirely in hand-written query filters; this adds a net underneath them.

Not a launch blocker for customer #1 (see "Launch call" at the end) — this is the
work to do **before several operators with real customer PII** share the DB.

## Current state (verified)

- **16 tenant tables.** RLS **enabled on 9**, **OFF on 7**: `api_keys`,
  `customers`, `customer_accounts`, `documents`, `saved_items`,
  `inquiry_messages`, `operator_ai_usage` (+ `promos`). Several of those hold the
  most sensitive data (customer PII, API secrets, private files).
- **1 policy total**, on `operator_members`. Every other table with RLS on has no
  rules → effectively deny-all to normal users, but…
- **45 files query via `createAdminClient()`** (service-role key — **bypasses RLS
  entirely**); only 2 use the user-scoped client, and only for auth checks.
- **Net effect: RLS is inert.** All isolation is app-level. Policies alone will do
  nothing until user-facing queries stop using the service role.

## Principals (who gets what)

| Principal | Identity | Access |
|---|---|---|
| **Operator user** | `auth.uid()` has `operator_members` row(s) | rows for **every** operator they're a member of (multi-operator supported; the active-operator cookie is UI-only, not a security boundary) |
| **Customer** | `auth.uid()` = `customer_accounts.id` (1:1) | **their own** bookings/orders (read), `saved_items` + own account (read/write) |
| **Anon (public)** | no session | storefront reads: published operator fields + visible items only |
| **Service role** | server key | everything — **stays** for webhooks, jobs, provisioning, guest checkout. Bypasses RLS by design. |

## Helper functions (keep policies DRY + fast)

```sql
-- operator_ids the current user belongs to. SECURITY DEFINER so it can read
-- operator_members regardless of that table's own policy; STABLE so the planner
-- caches it per statement; pinned search_path to avoid hijacking.
create function auth_operator_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select operator_id from operator_members where user_id = auth.uid()
$$;

-- customers.id rows owned by the current customer account (for booking access).
create function auth_customer_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select id from customers where account_id = auth.uid()
$$;
```

## Per-table policy design

**Group A — operator-owned** (operator r/w where `operator_id in (auth_operator_ids())`; no customer/anon read):
`items`*, `customers`, `inquiries`, `inquiry_messages`, `promos`, `documents`,
`api_keys`, `operator_ai_usage`, `operator_invites`, `operators`*.
⚠️ `customers.notes` is operator-private — the **customer principal must never read
the `customers` table**; the portal reads bookings, never this row.

**Group B — customer-owned:**
- `customer_accounts`: `id = auth.uid()` (read + update own name)
- `saved_items`: `account_id = auth.uid()` (read/insert/delete own)
- `bookings` / `booking_items` / `orders`: customer **SELECT** where the booking's
  `customer_id in (auth_customer_ids())`. (Read-only; paying happens via the
  public `/pay` flow, not the portal.)

**Group C — public/anon** (marked * above):
- `operators`: anon SELECT of the public storefront fields only
- `items`: anon SELECT where active/visible

**Group D — no user access:** `processed_webhook_events` (no policies → service role only).

**Stays on service role by design (guest-first, no auth):** `POST /api/bookings`
+ `/api/checkout` (a guest creates a booking with no login) — intentional public
writes, rate-limited. RLS is not meant to cover these.

## The real work: client migration

Policies are inert while queries use the service-role client. Each surface must
move user-facing queries to the **user-scoped** client (`utils/supabase/server`,
which carries the user's JWT so `auth.uid()` resolves) for RLS to fire.

**Keep service role** in: webhook handlers (stripe/signwell/twilio — no session),
background jobs (`expireStaleCheckouts`), signup/provisioning
(`api/auth/signup`, `ensureCustomerAccount`), and the guest checkout writes above.

## Phasing (each phase independently shippable + verified)

Do it **incrementally per surface** — write a table's policy, convert that
surface's queries, and test both "still works" AND "cross-tenant now blocked at
the DB" together. Never big-bang all-policies-then-all-conversions.

1. **Renter portal (`/my`)** — pilot. Smallest, newest, one principal, ~4 queries
   (`lib/customers/portal.ts`, `saved.ts`, `session.ts`). Convert to user-scoped,
   enable RLS + Group-B policies on `customer_accounts`/`saved_items`/`bookings`/
   `orders`. **Verify:** portal renders; a forged `account_id` query returns 0 rows
   from the DB itself. _Also the surface most exposed to real customers at launch._
2. **Operator app** — biggest, highest PII value. Convert operator queries to
   user-scoped, add Group-A policies. Do table-group by table-group (inventory →
   customers → bookings → inquiries → settings/docs/promos/api-keys), verifying
   each. `getSessionMembership` already resolves the user; RLS mirrors it.
3. **Public storefront + `/api/v1`** — Group-C anon read policies on
   `operators`/`items`; convert storefront/API reads. Lower risk (public catalog,
   already slug-scoped in one place), so it can trail — or stay on service role
   short-term since its cross-operator surface is contained to `getOperatorBySlug`.
4. **Audit + lock** — confirm `createAdminClient` remains only in
   webhooks/jobs/provisioning; add a test that **fails if a user-facing route
   imports the service-role client** (same style as the middleware-gate test).

## Gotchas specific to this app

- **Perf:** we deliberately avoid `getUser()` per-nav by trusting the middleware's
  verified-id header, and query via service role. User-scoped queries carry the
  JWT; Postgres validates it — cheap on our **ES256** keys, but it *is* a change.
  Measure nav latency after Phase 1.
- **`auth.uid()` needs the request to carry the user JWT** → the user-scoped
  server client via cookies. Fine in RSC/route handlers; **not** available in the
  header-only fast path, so those reads move to the cookie client.
- **Multi-operator:** policies key off `operator_members` (all memberships), NOT
  the active-operator cookie. The cookie is UI state, never a security boundary.
- **`customer_accounts.id = auth.uid()`** makes every customer policy trivial.
- Helper funcs must be `SECURITY DEFINER` + pinned `search_path` (injection guard).

## Effort

Phase 1 ~0.5–1d · Phase 2 ~1–2d · Phase 3 ~1d · Phase 4 ~0.5d → **~3–4 focused days.**

## Launch call

- **Customer #1 / one operator:** current app-level scoping is adequate — tested,
  single tenant, tiny blast radius. **RLS is not a hard blocker for the first
  customer.**
- **Do Phase 1 (portal) as a pilot soon** — it's the surface real customers touch
  and the cleanest to convert; it proves the pattern end-to-end on a small scope.
- **Phases 2–3 before onboarding several operators** with real customer lists —
  that's the scaling point where "one forgotten filter" stops being hypothetical.
