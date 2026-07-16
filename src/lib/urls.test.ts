import { describe, it, expect } from "vitest";
import { isAppPath, hostRoutingTarget } from "./urls";

describe("isAppPath", () => {
  it("classifies operator surfaces as app paths", () => {
    for (const p of [
      "/dashboard",
      "/calendar",
      "/bookings",
      "/bookings/abc-123",
      "/inquiries",
      "/deliveries",
      "/inventory",
      "/customers",
      "/customers/xyz",
      "/documents",
      "/promos",
      "/settings",
      "/account",
      "/more",
      "/billing",
      "/connect",
      "/onboarding",
    ]) {
      expect(isAppPath(p), p).toBe(true);
    }
  });

  it("classifies auth + onboarding as app paths (they belong with the operator app)", () => {
    for (const p of ["/login", "/signup", "/invite", "/invite/tok-123"]) {
      expect(isAppPath(p), p).toBe(true);
    }
  });

  it("classifies everything public as NOT an app path", () => {
    for (const p of [
      "/",
      "/pricing",
      "/terms",
      "/privacy",
      "/s/bounce-usa",
      "/s/bounce-usa/inventory",
      "/my",
      "/my/login",
      "/my/bookings/abc",
      "/pay/abc-123",
      "/book",
      "/embed",
    ]) {
      expect(isAppPath(p), p).toBe(false);
    }
  });

  it("does not match a path that merely starts with an app prefix's letters", () => {
    // `/settings` is an app path; `/settingsxyz` is not.
    expect(isAppPath("/settingsxyz")).toBe(false);
    expect(isAppPath("/logins")).toBe(false);
  });
});

describe("hostRoutingTarget", () => {
  const APP = "app.movables.ai";
  const PUB = "movables.ai";
  const hosts = { app: APP, public: PUB };

  describe("the split is off", () => {
    it("does nothing when a host is unset", () => {
      expect(hostRoutingTarget(APP, "/dashboard", { app: null, public: PUB })).toBeNull();
      expect(hostRoutingTarget(PUB, "/", { app: APP, public: null })).toBeNull();
    });

    it("does nothing when both hosts are the same (single-origin deploy)", () => {
      const same = { app: "bounce-app.vercel.app", public: "bounce-app.vercel.app" };
      expect(hostRoutingTarget("bounce-app.vercel.app", "/dashboard", same)).toBeNull();
      expect(hostRoutingTarget("bounce-app.vercel.app", "/", same)).toBeNull();
    });
  });

  describe("on the PUBLIC host (movables.ai)", () => {
    it("sends operator + auth paths to the app host", () => {
      expect(hostRoutingTarget(PUB, "/dashboard", hosts)).toBe("app");
      expect(hostRoutingTarget(PUB, "/settings/team", hosts)).toBe("app");
      expect(hostRoutingTarget(PUB, "/login", hosts)).toBe("app");
      expect(hostRoutingTarget(PUB, "/invite/tok", hosts)).toBe("app");
    });

    it("leaves marketing, storefront, portal, and pay where they are", () => {
      for (const p of ["/", "/pricing", "/s/bounce-usa", "/my", "/pay/abc", "/terms"]) {
        expect(hostRoutingTarget(PUB, p, hosts), p).toBeNull();
      }
    });
  });

  describe("on the APP host (app.movables.ai)", () => {
    it("sends public pages back to the public host", () => {
      for (const p of ["/", "/pricing", "/s/bounce-usa", "/my", "/pay/abc", "/terms"]) {
        expect(hostRoutingTarget(APP, p, hosts), p).toBe("public");
      }
    });

    it("leaves operator + auth paths where they are", () => {
      for (const p of ["/dashboard", "/customers", "/login", "/invite/tok"]) {
        expect(hostRoutingTarget(APP, p, hosts), p).toBeNull();
      }
    });
  });

  describe("served on both hosts — never redirected", () => {
    it("leaves /api/* alone on either host", () => {
      expect(hostRoutingTarget(PUB, "/api/customer/saved", hosts)).toBeNull();
      expect(hostRoutingTarget(APP, "/api/v1/catalog", hosts)).toBeNull();
    });

    it("leaves /embed alone on either host", () => {
      expect(hostRoutingTarget(PUB, "/embed", hosts)).toBeNull();
      expect(hostRoutingTarget(APP, "/embed", hosts)).toBeNull();
    });
  });

  it("ignores requests on any other host (preview deploys, localhost, www)", () => {
    // www.movables.ai redirects to the apex at the edge before we'd see it, and
    // preview URLs must keep serving the whole app from one origin.
    expect(hostRoutingTarget("bounce-app-git-x.vercel.app", "/dashboard", hosts)).toBeNull();
    expect(hostRoutingTarget("localhost:3000", "/", hosts)).toBeNull();
    expect(hostRoutingTarget("www.movables.ai", "/dashboard", hosts)).toBeNull();
  });

  it("never bounces a request back and forth (no redirect loop)", () => {
    // The invariant that matters: after one redirect, the destination host must
    // NOT want to redirect the same path again.
    for (const path of ["/", "/dashboard", "/s/x", "/login", "/my", "/pay/x", "/pricing"]) {
      const first = hostRoutingTarget(PUB, path, hosts) ?? hostRoutingTarget(APP, path, hosts);
      if (!first) continue;
      const landingHost = first === "app" ? APP : PUB;
      expect(hostRoutingTarget(landingHost, path, hosts), `${path} loops`).toBeNull();
    }
  });
});
