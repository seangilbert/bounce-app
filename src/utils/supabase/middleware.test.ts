import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { OPERATOR_PREFIXES } from "./middleware";

/**
 * The middleware gate is the operator app's PRIMARY defense. A route that isn't
 * in OPERATOR_PREFIXES is served to anonymous visitors, and whether that leaks
 * anything then depends on the page remembering to check membership itself.
 *
 * That defense had already failed once: /customers, /promos, /documents and
 * /account were each added to the app over time and never added to the list.
 * Nothing leaked — the pages did guard — but a single forgotten guard in a
 * future page would have.
 *
 * So don't trust a hand-maintained list. Read the route group off disk and make
 * the omission a failing test rather than a security incident.
 */
const OPERATOR_GROUP = join(process.cwd(), "src/app/(operator)");

function operatorRoutes(): string[] {
  return readdirSync(OPERATOR_GROUP, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    // Route groups "(x)" and private folders "_x" aren't URL segments.
    .filter((e) => !e.name.startsWith("(") && !e.name.startsWith("_"))
    // Only directories that actually render a page are reachable URLs.
    .filter((e) => existsSync(join(OPERATOR_GROUP, e.name, "page.tsx")))
    .map((e) => `/${e.name}`);
}

describe("OPERATOR_PREFIXES covers the whole operator app", () => {
  it("finds the route group on disk (guards against this test silently passing)", () => {
    // If the path ever moves, the test below would trivially pass over an empty
    // list and stop protecting anything.
    expect(operatorRoutes().length).toBeGreaterThan(5);
  });

  it.each(operatorRoutes())("gates %s", (route) => {
    expect(OPERATOR_PREFIXES).toContain(route);
  });

  it("gates every non-page operator surface that has no route folder", () => {
    // These live outside the (operator) group but are still operator-only.
    for (const p of ["/billing", "/connect", "/onboarding"]) {
      expect(OPERATOR_PREFIXES).toContain(p);
    }
  });

  it("does not gate the renter portal or any public surface", () => {
    // A false positive here would lock customers out of their own portal, or
    // put the public storefront behind a login.
    for (const p of ["/my", "/s", "/pay", "/embed", "/login", "/signup", "/"]) {
      expect(OPERATOR_PREFIXES).not.toContain(p);
    }
  });
});
