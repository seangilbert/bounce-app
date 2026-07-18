import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CI GUARD — every table must have Row Level Security ENABLED.
 *
 * This exists because it already went wrong: migrations 0046/0047 (and, by the
 * same omission, 0023/0038/0040/0042) created tables WITHOUT
 * `enable row level security`, and Supabase's default grants let the public anon
 * key read `customer_accounts` (every customer's email + name) directly via
 * PostgREST — a live PII leak, fixed in 0050. RLS-off is never intentional here,
 * so make the omission a failing test instead of a security incident.
 *
 * A table needs at least a deny-all baseline (RLS enabled, no policy is fine —
 * the service-role client bypasses RLS for trusted server access). Per-surface
 * SELECT policies for renters/operators are layered on in the RLS phases.
 */
const MIGRATIONS = join(process.cwd(), "supabase/migrations");

/** Tables that legitimately have RLS off. Empty by design — add with a reason. */
const EXCEPTIONS = new Set<string>();

function allSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

function matchAll(sql: string, re: RegExp): Set<string> {
  const out = new Set<string>();
  for (const m of sql.matchAll(re)) out.add(m[1]);
  return out;
}

describe("RLS coverage — every table has RLS enabled", () => {
  const sql = allSql().toLowerCase();
  // Whitespace-tolerant, and the `public.` schema prefix is optional (migrations
  // use both `create table public.x` and bare `create table x`).
  const created = matchAll(sql, /create table\s+(?:if not exists\s+)?(?:public\.)?(\w+)/g);
  const rlsEnabled = matchAll(sql, /alter table\s+(?:only\s+)?(?:public\.)?(\w+)\s+enable\s+row\s+level\s+security/g);

  it("finds tables + RLS statements (guards against the regex silently matching nothing)", () => {
    expect(created.size).toBeGreaterThan(10);
    expect(rlsEnabled.size).toBeGreaterThan(10);
  });

  it.each([...created].sort())("table %s has RLS enabled", (table) => {
    if (EXCEPTIONS.has(table)) return;
    expect(rlsEnabled.has(table), `public.${table} was created but never got 'enable row level security'`).toBe(true);
  });
});
